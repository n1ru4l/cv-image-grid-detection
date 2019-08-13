const { cv } = window

const loadImage = src => {
  const image = new Image();

  const cancel = () => {
    image.src = "";
  };

  const promise = new Promise((resolve, reject) => {
    image.crossOrigin = "anonymous";
    image.src = src;
    const removeEventListeners = () => {
      image.removeEventListener("load", loadListener);
      image.removeEventListener("error", errorListener);
    };
    const loadListener = () => {
      removeEventListeners();
      resolve(image);
    };
    const errorListener = err => {
      removeEventListeners();
      reject(err);
    };
    image.addEventListener("load", loadListener);
    image.addEventListener("error", errorListener);
  });

  return { promise, cancel };
};

const angle = (p1, p2) => {
  return (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180.0) / Math.PI;
};

cv['onRuntimeInitialized']=()=>{
  main()
};

const main = () => {
  loadImage("/public/rocky-harbor.jpg").promise.then(image => {
    const inputImage = cv.imread(image);
    const copy = inputImage.clone();
    cv.cvtColor(copy, copy, cv.COLOR_RGBA2GRAY, 0);

    const low_threshold = 50
    const high_threshold = 100

    cv.Canny(copy, copy, low_threshold, high_threshold, 3, false);
  
    const ksize = new cv.Size(3, 3);
    cv.GaussianBlur(copy, copy, ksize, 0, 0, cv.BORDER_DEFAULT);
   
    //cv.dilate(copy, copy, cv.Mat.ones(3, 3, cv.CV_8U));
    cv.erode(copy, copy, cv.Mat.ones(3, 3, cv.CV_8U));

    // cv.imshow("canvasOutput", copy);
    // return

    const lines = new cv.Mat();

    cv.HoughLinesP(copy, lines, 1, Math.PI / 180, 2, 200, 5);
    
  
    const color = new cv.Scalar(255, 255, 255);

    const lineGridMat = new cv.Mat(image.width, image.height, cv.CV_8UC3, new cv.Scalar(0, 0, 0));

    for (let i = 0; i < lines.rows; ++i) {
      let startPoint = new cv.Point(lines.data32S[i * 4], lines.data32S[i * 4 + 1]);
      let endPoint = new cv.Point(lines.data32S[i * 4 + 2], lines.data32S[i * 4 + 3]);
      const lineAngle = Math.abs(angle(startPoint, endPoint));
      if (lineAngle === 90) {
        const x = startPoint.x;
        const y1 = 0
        const y2 = copy.rows;
        cv.line(lineGridMat, { x, y: y1 }, { x, y: y2 }, color);
      }
      else if (lineAngle === 0) {
        const y = startPoint.y;
        const x1 = 0
        const x2 = copy.cols;
        cv.line(lineGridMat, { x: x1, y }, { x: x2, y }, color);
      }
    }

    cv.cvtColor(lineGridMat, lineGridMat, cv.COLOR_RGBA2GRAY, 0);

    const drawSquare = (img, x, y, width, height, color) => {

      let npts = 4;
      let squarePointData = [
        x, y,
        x + width, y,
        x + width, y + height,
        x, y + height
      ];
      let squarePoints = cv.matFromArray(npts, 1, cv.CV_32SC2, squarePointData);
      let pts = new cv.MatVector();
      pts.push_back(squarePoints);
      cv.fillPoly(img, pts, color);

      squarePoints.delete();
      pts.delete();
    }

    const squares = []

    for (let y = 0; y < lineGridMat.size().height; y++) {
      const row = lineGridMat.ptr(y);
      for (let x = 0; x < lineGridMat.size().width; x++) {
        const currentPixelIsBlack = row[x] === 0
        if (!currentPixelIsBlack) {
          continue
        }
  
        const previousPixelIsWhite = row[x - 1] === 255;
        const previousPixelDoesNotExist = row[x - 1] === undefined
        if (!previousPixelIsWhite && !previousPixelDoesNotExist) {
          continue
        }

        let pixelAboveIsWhite = false
        const pixelAboveDoesNotExist = y > 0
  
        if (pixelAboveDoesNotExist === false) {
          const previousRow = lineGridMat.ptr(y - 1);
          pixelAboveIsWhite = previousRow[x] === 255
        }
        if (!pixelAboveIsWhite && !pixelAboveDoesNotExist) {
          continue;
        }

        const p1 = { x, y }

        do {
          x++
        } while (row[x] === 0)
        if (row[x] === undefined) {
          break;
        }

        const p2 = { x: x - 1, y };

        for (let curY = y; curY < lineGridMat.size().height; curY++) {
          const currentRow = lineGridMat.ptr(curY);
          if (currentRow[x - 1] === 255) {
            const p3 = { x: x - 1, y: curY - 1 }
            squares.push([p1, p2, p3])
            break;
          }
        }
      }
    }

    const mappings = new Map();

    // sort squares by sideLength

    for (let points of squares) {
      const width = points[1].x - points[0].x
      const height = points[2].y - points[1].y
      const identifier = width

      // we assume that it must have a height and a width and that those values must be the same
      if (width !== 0 && height !== 0 && width === height) {
        let items = mappings.get(identifier)
        if (!items) {
          items = []
          mappings.set(identifier, items)
        }
        items.push(points[0])
      }
    }



    // identify most occuring shape

    const countByIdentifier = new Map([...mappings.entries()].map(([identifier, items]) => [identifier, items.length]))

    console.log(countByIdentifier)


    let mostOccuringFieldIdentifier = null
    let mostOccuringFieldCount = -1
    
    for (let [identifier, count] of countByIdentifier) {
      if (count > mostOccuringFieldCount && identifier > 10) {
        mostOccuringFieldIdentifier = identifier
        mostOccuringFieldCount = count
      }
    }

    if (mostOccuringFieldIdentifier === null) {
      alert("Could not find any squares")
      return
    }

    let sideLength = mostOccuringFieldIdentifier
    const squareData = mappings.get(mostOccuringFieldIdentifier)

    // draw all elements of the most occuring shape

    const squareMat = new cv.Mat(image.width, image.height, cv.CV_8UC3, new cv.Scalar(0, 0, 0));


    let startPoint = null
    let finalGutterWidth = null

    // find 4x4 grid occurance of the shape but actuall we do only care about (0, 0) (0, 1) and (1, 0)
    // x | x
    // ------
    // x | x 

    for (let point of squareData) {
      drawSquare(squareMat, point.x, point.y, sideLength, sideLength, new cv.Scalar(255))
      
      const yPoints = squareData.filter(p => p.y === point.y && p !== point && p.x > point.x);
      // determine closest point to the right
      let rightPoint = null;
      let gutterWidth = null;
      for (let pointInner of yPoints) {
        const distance = pointInner.x - point.x
        const currentGutterWidth = distance - sideLength;
        if (currentGutterWidth > (sideLength / 3)) {
          continue
        }

        rightPoint = pointInner
        gutterWidth = currentGutterWidth
        break;
      }
      if (rightPoint === null || gutterWidth === null) {
        continue;
      }
      const belowPoint = squareData.find(p => p.x === point.x && p.y === point.y + sideLength + gutterWidth) || null

      if (rightPoint !== null && belowPoint !== null) {
        console.log(point, belowPoint, rightPoint, gutterWidth)
        // pattern detected
        // drawSquare(squareMat, point.x, point.y, sideLength, sideLength, new cv.Scalar(90))
        // drawSquare(squareMat, rightPoint.x, rightPoint.y, sideLength, sideLength, new cv.Scalar(90))
        // drawSquare(squareMat, belowPoint.x, belowPoint.y, sideLength, sideLength, new cv.Scalar(90))
        startPoint = belowPoint
        finalGutterWidth = gutterWidth
        break;
      }
    }

    if (!startPoint || !finalGutterWidth) {
      console.log("could not find square alignment.")
      for (let [sideLength, points] of mappings) {
        for (let point of points) {
          drawSquare(inputImage, point.x, point.y, sideLength, sideLength, new cv.Scalar(255))
        }
        cv.imshow("canvasOutput", inputImage);
      }
      return
    }

    if (finalGutterWidth % 2 !== 0) {
      console.log("gutter width is not even :/")
    }

    // optional reduce gutterWidth to minimum pixel cound e.g. gutterWidth of 8 becomes 2 
    do {
      const newGutterWidth = finalGutterWidth / 2;
      if (newGutterWidth % 2 !== 0) {
        break;
      }
      finalGutterWidth = newGutterWidth;
      sideLength = sideLength + newGutterWidth;
      startPoint = { x: startPoint.x - newGutterWidth / 2, y: startPoint.y - newGutterWidth / 2 };
    } while (true)

    // draw grid y

    let lowestHorizontalGutterY = startPoint.y - finalGutterWidth
    do {
      const newValue = lowestHorizontalGutterY - finalGutterWidth - sideLength
      if (newValue < 0) {
        break;
      }
      lowestHorizontalGutterY = newValue
    } while(true)

    for (let a = lowestHorizontalGutterY; a < inputImage.size().height; a = a + finalGutterWidth + sideLength) {
      drawSquare(inputImage, 0, a, inputImage.size().width, finalGutterWidth, new cv.Scalar(90))
    }

    // draw grid x

    let lowestVericalGutterX = startPoint.x - finalGutterWidth
    do {
      const newValue = lowestVericalGutterX - finalGutterWidth - sideLength
      if (newValue < 0) {
        break;
      }
      lowestVericalGutterX = newValue
    } while(true)

    for (let a = lowestVericalGutterX; a < inputImage.size().width; a = a + finalGutterWidth + sideLength) {
      drawSquare(inputImage, a, 0, finalGutterWidth, inputImage.size().height, new cv.Scalar(90))
    }

    cv.imshow("canvasOutput", inputImage);
    copy.delete();
    inputImage.delete();
  });
  
}