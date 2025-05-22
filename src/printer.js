// Seems to work best with 128 bytes
const PACKET_SIZE_BYTES = 128;
/**
 * Return the header data needed to start the print session.
 * Adapted from {@link https://github.com/Knightro63/phomemo}
 *
 * @param {number} mmWidth the width (in mm) of the image. labels are printed vertically, so for e.g. a 40mm W x 12mm H label this would be 12.
 * @param {number} bytes the amount of bytes expected per row of the image e.g. (data.length / mmWidth)
 * @returns {Uint8Array}
 */
const HEADER_DATA = (mmWidth, bytes) =>
	new Uint8Array([
		0x1b,
		0x40,
		0x1d,
		0x76,
		0x30,
		0x00,
		mmWidth % 256,
		Math.floor(mmWidth / 256),
		bytes % 256,
		Math.floor(bytes / 256),
	]);
/** Constant data which ends the print session. */
const END_DATA = new Uint8Array([0x1b, 0x64, 0x00]);

/**
 * Determines a given pixel to be either black (0) or white (1).
 * Adapted from {@link https://github.com/WebBluetoothCG/demos/tree/gh-pages/bluetooth-printer}
 *
 * @param {HTMLCanvasElement} canvas the canvas you're printing
 * @param {Uint8Array} imageData the image data to check
 * @param {number} x X of the pixel to check
 * @param {number} y Y of the pixel to check
 * @returns {number} 0 if pixel should be printed black, 1 if white
 */
const getWhitePixel = (canvas, imageData, x, y) => {
	const red = imageData[(canvas.width * y + x) * 4];
	const green = imageData[(canvas.width * y + x) * 4 + 1];
	const blue = imageData[(canvas.width * y + x) * 4 + 2];
	return red + green + blue > 0 ? 0 : 1;
};

const getBWPixel = (ctx, x, y) => {
	const imageData = ctx.getImageData(x, y, 1, 1);
	const [red, green, blue, alpha] = imageData.data;
	/* Split alpha in half seems reasonable */
	if (alpha < 128) {
		return 0;	
	}
	return red + green + blue > 0 ? 0 : 1;
}

/**
 * Given a canvas, converts it to a byte array in the format expected by the Phomemo D30.
 * Adapted from {@link https://github.com/WebBluetoothCG/demos/tree/gh-pages/bluetooth-printer}
 *
 * @param {HTMLCanvasElement} canvas the canvas to convert to print data
 * @returns {Uint8Array} the byte array to transmit (in chunks) to the Bluetooth printer
 */
const getPrintData = (canvas) => {
	const ctx = canvas.getContext("2d", { willReadFrequently: true });

	// Each 8 pixels in a row is represented by a byte
	const data = new Uint8Array((canvas.width / 8) * canvas.height + 8);
	let offset = 0;
	// Loop through image rows in bytes
	for (let y = 0; y < canvas.height; y++) {
		for (let x = 0; x < canvas.width; x+=8) {
			// Pixel to bit position mapping
			for (let b = 0; b < 8; b++) {
				data[offset] += getBWPixel(ctx, x + b, y) * Math.pow(2, 7-b);
			}
			offset++;
		}
	}

	return data;
};

/**
 * Given a Bluetooth characteristic and a canvas, sends the necessary data to print it.
 * @param {BluetoothRemoteGATTCharacteristic} characteristic
 * @param {HTMLCanvasElement} canvas
 */
export const printCanvas = async (characteristic, canvas) => {
	const data = getPrintData(canvas);

	await characteristic.writeValueWithResponse(
		HEADER_DATA(canvas.width / 8, data.length / (canvas.width / 8))
	);

	for (let i = 0; ; i += PACKET_SIZE_BYTES) {
		if (i < data.length) {
			await characteristic.writeValueWithResponse(data.slice(i, i + PACKET_SIZE_BYTES));
		} else {
			await characteristic.writeValueWithResponse(data.slice(i * PACKET_SIZE_BYTES, data.length));
			break;
		}

		console.log(`Sent ${i}/${data.length} bytes`);
	}

	console.log(`Sent ${data.length}/${data.length} bytes (done)`);
	await characteristic.writeValueWithResponse(END_DATA);
};
