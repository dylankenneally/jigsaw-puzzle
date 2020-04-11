function Piece(x, y, w, h, solvedX, solvedY, rowX, rowY) {
	this.x = x;
	this.y = y;
	this.w = w;
	this.h = h;
	this.solvedX = solvedX;
	this.solvedY = solvedY;
	this.dimmed = true; // should be called dimmed
	this.solved = false;
	this.offsetX = -1;
	this.offsetY = -1;
	this.rowX = rowX;
	this.rowY = rowY;
}

class Puzzle {
	constructor(image, parentElement, canvasElement, onInitialisedCB = null, onSolvedCB = null, piecesAcross = 12, piecesDown = 9) {
		// the image being solved
		if (!(image instanceof Image)) {
			throw new TypeError('The supplied image is not an `Image`');
		}

		this._image = image;
		this._image2 = image;

		// the canvasElement's parent DOM element - needed to centre the puzzle
		if (!(parentElement instanceof Element)) {
			throw new TypeError('The supplied parent of canvas element is not a DOM `Element`');
		}

		this._parentElement = parentElement;

		// the DOM element we render in to
		if (!(canvasElement instanceof Element)) {
			throw new TypeError('The supplied canvas element is not a DOM `Element`');
		}

		this._canvas = canvasElement;
		if (!this._canvas.getContext) {
			throw new TypeError('The supplied canvas element does not support the Canvas API');
		}

		// the CanvasRenderingContext2D  2d canvas we paint on
		this._renderContext = this._canvas.getContext('2d');
		if (!(this._renderContext instanceof CanvasRenderingContext2D)) {
			throw new TypeError('The supplied canvas element does not support 2D rendering');
		}

		// pieces across (X axis) & down (Y axis)
		if (!Number.isInteger(piecesAcross) || piecesAcross <= 0 || !Number.isInteger(piecesDown) || piecesDown <= 0) {
			throw new RangeError('piecesAcross and piecesDown must be positive integers');
		}

		this._numberOfPieces = [piecesAcross, piecesDown];

		this._canvasSize = [0, 0];				// canvas attributes
		this._cachedCanvasSize = [0, 0];		// used during resize operations

		this._pieces = [];						// pieces yet to be placed in the correct location
		this._solvedPieces = [];				// pieces placed in the correct location
		this._pieceBeingMoved = -1;				// index of the piece being moved/dragged

		// callback events
		this._puzzleInitialisedCallback = null;	// callback to be called when ever the puzzle is initialised, register via onInitialised
		this._puzzleSolvedCallback = null;		// callback to be called when ever the puzzle is solved, register via onSolved
		this.onInitialised(onInitialisedCB);
		this.onSolved(onSolvedCB);

		this._debug = false;						// handy for debugging render issues

		this.initialise();
		this._setupEventHandlers();
		setInterval(() => this._render(), 10);
	}

	// initialise the puzzle, call this to restart the puzzle
	initialise(across = undefined, down = undefined) {
		if ((across && !down) || (!across && down)) {
			throw new TypeError('across and down must both be specified, or must both be missing');
		}

		// pieces across (X axis) & down (Y axis)
		if (across !== undefined) {
			if (!Number.isInteger(across) || across <= 0 || !Number.isInteger(down) || down <= 0) {
				throw new RangeError('across and down must be positive integers');
			}

			this._numberOfPieces[0] = across;
			this._numberOfPieces[1] = down;
		}

		this._initCanvasSize();
		this._cachedCanvasSize[0] = this._canvasSize[0];
		this._cachedCanvasSize[1] = this._canvasSize[1];

		this._createPieces();
		if (this._puzzleInitialisedCallback) {
			this._puzzleInitialisedCallback();
		}
	}

	_initCanvasSize() {
		const sizes = Puzzle.calculateAspectRatio(this._image.width, this._image.height, this._parentElement.offsetWidth, this._parentElement.offsetHeight);
		this._canvas.width = this._canvasSize[0] = sizes[0];
		this._canvas.height = this._canvasSize[1] = sizes[1];
	}

	// register a callback function to be used when the puzzle is initialised
	onInitialised(callback) {
		if (callback && typeof callback !== 'function') {
			throw new TypeError('Puzzle initialised callback must be a function');
		}

		this._puzzleInitialisedCallback = callback;
	}

	// register a callback function to be used when the puzzle is solve
	onSolved(callback) {
		if (callback && typeof callback !== 'function') {
			throw new TypeError('Puzzle solved callback must be a function');
		}

		this._puzzleSolvedCallback = callback
	}

	// given a width and height representing an aspect ratio, and the size of the containing thing, return the largest w and h matching that aspect ratio
	static calculateAspectRatio(idealWidth, idealHeight, parentWidth, parentHeight) {
		const aspect = Math.floor((parentHeight / idealHeight) * idealWidth);
		var w = Math.min(parentWidth, aspect);
		var h = (w / idealWidth) * idealHeight;
		return [w, h];
	}

	_clearCanvas() {
		// setting the canvas width prevents 'trails' being renders
		this._canvas.width = this._canvas.width; // eslint-disable-line no-self-assign
	}

	// call this to notify the puzzle of a different canvas size (hock up to the window resize event if desired)
	resizeCanvas() {
		this._initCanvasSize();

		const deltaX = (this._canvasSize[0] / this._cachedCanvasSize[0]) * 100;
		const deltaY = (this._canvasSize[1] / this._cachedCanvasSize[1]) * 100;

		const piecesMover = (pieces) => {
			pieces.forEach((piece) => {
				piece.x = (piece.x / 100) * deltaX;
				piece.y = (piece.y / 100) * deltaY;
				piece.w = (piece.w / 100) * deltaX;
				piece.h = (piece.h / 100) * deltaY;
				piece.solvedX = (piece.solvedX / 100) * deltaX;
				piece.solvedY = (piece.solvedY / 100) * deltaY;
			});
		};

		piecesMover(this._pieces);
		piecesMover(this._solvedPieces);

		this._cachedCanvasSize[0] = this._canvasSize[0];
		this._cachedCanvasSize[1] = this._canvasSize[1];
	}

	_setupEventHandlers() {
		const onDown = document.ontouchstart !== null ? 'mousedown' : 'touchstart';
		this._canvas.addEventListener(onDown, (e) => {
			const clicked = this._clickDown(e);
			this._clickPiece(clicked[0], clicked[1]);
		}, false);

		const onUp = document.ontouchstart !== null ? 'mouseup' : 'touchend';
		this._canvas.addEventListener(onUp, () => this._releasePiece(), false);

		const onMove = document.ontouchstart !== null ? 'mousemove' : 'touchmove';
		this._canvas.addEventListener(onMove, (e) => {
			if (this._pieceBeingMoved !== -1) {
				this._movePiece(e);
			}
		}, false);
	}

	_clickDown(e) {
		const rect = this._canvas.getBoundingClientRect();
		let x = e.clientX - rect.left;
		let y = e.clientY - rect.top;
		if (typeof e.changedTouches !== 'undefined') {
			x = e.changedTouches[0].pageX - rect.left;
			y = e.changedTouches[0].pageY - rect.top;
		}

		return [x, y];
	}

	_clickPiece(x, y) {
		for (let i = this._pieces.length - 1; i >= 0; --i) {
			if (!Puzzle._hasCollision(this._pieces[i], x, y)) {
				continue;
			}

			this._pieceBeingMoved = i;

			// dim the other pieces so it's easier to see whats being moved
			this._pieces.forEach((piece) => piece.dimmed = false);

			this._pieces[i].dimmed = true;
			this._pieces[i].offsetX = x - this._pieces[i].x;
			this._pieces[i].offsetY = y - this._pieces[i].y;
			return;
		}
	}

	_releasePiece() {
		if (this._pieceBeingMoved === -1) {
			return;
		}

		// un-dim all pieces
		this._pieces.forEach((piece) => piece.dimmed = true);

		this._pieces[this._pieceBeingMoved].offsetX = 0;
		this._pieces[this._pieceBeingMoved].offsetY = 0;

		if (!this._isSolved(this._pieces[this._pieceBeingMoved])) {
			// move to end so that it will be on top in the render loop
			const tmp = this._pieces[this._pieceBeingMoved];
			this._pieces.splice(this._pieceBeingMoved, 1);
			this._pieces.push(tmp);
		}

		this._pieceBeingMoved = -1;

		if (this._pieces.length === 0 && this._puzzleSolvedCallback) {
			this._puzzleSolvedCallback();
		}
	}

	_movePiece(e) {
		const movement = this._clickDown(e);
		const piece = this._pieces[this._pieceBeingMoved];
		const posX = movement[0] - piece.offsetX;
		const posY = movement[1] - piece.offsetY;

		// keep in the canvas
		piece.x = Math.min(Math.max(0, posX), this._canvasSize[0] - piece.w);
		piece.y = Math.min(Math.max(0, posY), this._canvasSize[1] - piece.h);
	}

	_isSolved(piece) {
		let result = false;
		const tolerance = 20;

		if (Math.abs(piece.x - piece.solvedX) <= tolerance && Math.abs(piece.y - piece.solvedY) <= tolerance) {
			result = true;
			piece.x = piece.solvedX;
			piece.y = piece.solvedY;
			piece.solved = true;

			const tmp = piece;
			this._pieces.splice(this._pieceBeingMoved, 1);
			this._solvedPieces.push(tmp);
		}

		return result;
	}

	static _hasCollision(piece, x, y) {
		if (piece.solved) {
			return false;
		}

		if (y > piece.y + piece.h) {
			return false;
		}

		if (y < piece.y) {
			return false;
		}

		if (x > piece.x + piece.w) {
			return false;
		}

		if (x < piece.x) {
			return false;
		}

		return true;
	}

	// create all the pieces of the puzzle
	_createPieces() {
		this._pieces = [];
		this._solvedPieces = [];

		const w = this._canvasSize[0] / this._numberOfPieces[0];
		const h = this._canvasSize[1] / this._numberOfPieces[1];

		// leave space around the edges
		const rangeMinX = (this._canvasSize[0] / 100) * 10;
		const rangeMaxX = ((this._canvasSize[0] - w) / 100) * 90;
		const rangeMinY = (this._canvasSize[1] / 100) * 10;
		const rangeMaxY = ((this._canvasSize[1] - h) / 100) * 90;

		const randomNumber = (min, max) => {
			return ((Math.random() * (max - min) + min));
		};

		for (let y = 0; y < this._numberOfPieces[1]; ++y) {
			for (let x = 0; x < this._numberOfPieces[0]; ++x) {
				let pieceX = randomNumber(rangeMinX, rangeMaxX);
				let pieceY = randomNumber(rangeMinY, rangeMaxY);

				if (this._debug) {
					// draw in solved position
					pieceX = w * x;
					pieceY = h * y;
				}

				const solvedX = w * x;
				const solvedY = h * y;
				const newPiece = new Piece(pieceX, pieceY, w, h, solvedX, solvedY, x, y);
				this._pieces.push(newPiece);
			}
		}
	}

	_render() {
		this._clearCanvas();
		this._solvedPieces.forEach((piece) => this._renderPiece(piece));
		this._pieces.forEach((piece) => this._renderPiece(piece));

		this._renderContext.globalAlpha = 0.1;
		this._renderContext.drawImage(this._image2, 0, 0, this._canvasSize[0], this._canvasSize[1]);
	}

	_renderTab(piece, edge, antiClockwise) {
		let x = 0;
		let y = 0;
		let startAngle = 0;
		let endAngle = 0;
		switch (edge) {
			case 0:
				x = piece.x + (piece.w / 2);
				y = piece.y;
				startAngle = 1 * Math.PI;
				endAngle = 0 * Math.PI;
				break;
			case 1:
				x = piece.x + piece.w;
				y = piece.y + (piece.h / 2);
				startAngle = 1.5 * Math.PI;
				endAngle = 0.5 * Math.PI;
				break;
			case 2:
				x = piece.x + (piece.w / 2);
				y = piece.y + piece.h;
				startAngle = 0 * Math.PI;
				endAngle = 1 * Math.PI;
				break;
			case 3:
				x = piece.x;
				y = piece.y + (piece.h / 2);
				startAngle = 0.5 * Math.PI;
				endAngle = 1.5 * Math.PI;
				break;
		}

		const radius = Math.min(piece.h / 4, piece.w / 4);
		this._renderContext.arc(x, y, radius, startAngle, endAngle, antiClockwise);
	}

	_renderPiece(piece) {
		this._renderContext.save();

		const pieceXEven = piece.rowX % 2 === 0;
		const pieceYEven = piece.rowY % 2 === 0;

		this._renderContext.lineWidth = piece.solved ? 0 : 2;
		this._renderContext.strokeStyle = `rgba(0,0,0,${piece.solved ? 0 : 0.5})`;

		if (!piece.dimmed) {
			this._renderContext.globalAlpha = 0.1;
		}

		this._renderContext.beginPath();
		this._renderContext.moveTo(piece.x, piece.y); //top left corner

		let edge = 0; // top
		let antiClockwise = true;
		if (piece.rowY > 0) {
			antiClockwise = pieceYEven === pieceXEven;
			this._renderTab(piece, edge, antiClockwise);
		}

		this._renderContext.lineTo(piece.x + piece.w, piece.y); //top right corner

		edge = 1; //right
		antiClockwise = true;
		if (piece.rowX < this._numberOfPieces[0] - 1) {
			antiClockwise = pieceYEven !== pieceXEven;
			this._renderTab(piece, edge, antiClockwise);
		}

		this._renderContext.lineTo(piece.x + piece.w, piece.y + piece.h); //bottom right corner

		edge = 2; // bottom
		antiClockwise = true;
		if (piece.rowY < this._numberOfPieces[1] - 1) {
			antiClockwise = pieceYEven === pieceXEven;
			this._renderTab(piece, edge, antiClockwise);
		}

		this._renderContext.lineTo(piece.x, piece.y + piece.h); //bottom left corner

		edge = 3; // left
		antiClockwise = true;
		if (piece.rowX > 0) {
			antiClockwise = pieceYEven !== pieceXEven;
			this._renderTab(piece, edge, antiClockwise);
		}

		this._renderContext.lineTo(piece.x, piece.y); //top left corner - back to origin
		this._renderContext.closePath();

		this._renderContext.clip();
		this._renderContext.drawImage(this._image, 0 - piece.solvedX + piece.x, 0 - piece.solvedY + piece.y, this._canvasSize[0], this._canvasSize[1]);
		this._renderContext.stroke();
		this._renderContext.restore();
	}
}
