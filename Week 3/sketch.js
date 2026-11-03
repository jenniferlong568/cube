/**
 * Chromatic Cubic Transcendence
 * A 6-stage nested cube animation in p5.js WEBGL
 */

let baseSize;      // Stores the base size of the largest cube
let maxCubes;      // Parameter: Total number of nested cubes
let animSpeed;     // Parameter: Speed of the appearing/disappearing animation
let rotationSpeed; // Parameter: Speed of the overall 3D rotation
let hueSpeed;      // Parameter: Speed of the color cycle shift

let counts = 0;    // Current animation progress (ranges from 0 to maxCubes)
let animState = 0; // State machine (0: Out->In Grow, 1: In->Out Shrink, 2: Out->In Grow, 3: Out->In Shrink, 4: In->Out Grow, 5: In->Out Shrink)

let baseHue = 0;   // Starting hue value for the rainbow effect
let angleStep;     // Constant for the rotational offset between layers
let scaleFactor;   // Calculation for the shrinking ratio between layers

let offsetX = 0;   // Horizontal position of the cube, moved by dragging
let offsetY = 0;   // Vertical position of the cube, moved by dragging

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL); // Initialize a 3D canvas
  colorMode(HSL, 360, 100, 100, 100);             // Set color mode to Hue, Saturation, Lightness
  frameRate(60);                                  // Target 60 frames per second for smooth motion

  // --- Animation Parameters ---
  maxCubes = 80;       // Set the density of cubes
  animSpeed = 0.4;     // Adjust the speed of the transition phases
  rotationSpeed = 0.8; // Adjust the global rotation velocity
  hueSpeed = 2.0;      // Adjust how fast colors flow through the cubes
  // ----------------------------

  baseSize = min(width, height) * 0.9;    // Set size to 90% of the smaller screen dimension
  scaleFactor = pow(0.02, 1 / maxCubes);  // Calculate scaling ratio based on cube count
  angleStep = PI / 18;                    // Set the fixed rotation increment per layer
  cursor('grab');                         // Show an open hand to hint the cube can be dragged
}

function draw() {
  background(0); // Set the background to solid black

  translate(offsetX, offsetY); // Move the cube to where the user dragged it

  // Global rotation logic
  let rotAngle = frameCount * 0.01 * rotationSpeed; // Calculate rotation based on time and speed
  rotateX(rotAngle * 0.2); // Rotate the entire scene on X-axis
  rotateY(rotAngle * 0.3); // Rotate the entire scene on Y-axis
  rotateZ(rotAngle * 0.1); // Rotate the entire scene on Z-axis

  noFill();             // Render wireframes only (transparent faces)
  strokeWeight(1.5);    // Set the thickness of the cube edges

  let startI = 0; // The index of the first cube to draw
  let endI = 0;   // The index of the last cube to draw

  // Define drawing range logic for the 6 animation states
  switch (animState) {
    case 0: // Grow from Outside to Inside
      startI = 0;
      endI = counts;
      break;
    case 1: // Shrink from Inside to Outside
      startI = 0;
      endI = maxCubes - counts;
      break;
    case 2: // Grow from Outside to Inside (Repeat)
      startI = 0;
      endI = counts;
      break;
    case 3: // Shrink from Outside to Inside
      startI = counts;
      endI = maxCubes;
      break;
    case 4: // Grow from Inside to Outside
      startI = maxCubes - counts;
      endI = maxCubes;
      break;
    case 5: // Shrink from Inside to Outside (Repeat)
      startI = 0;
      endI = maxCubes - counts;
      break;
  }

  // Loop through all possible cubes and render those within the active range
  for (let i = 0; i < maxCubes; i++) {
    if (i >= startI && i < endI) {
      let hue = (baseHue + i * (360 / maxCubes)) % 360; // Calculate color for the current layer
      let lightness = map(i, 0, maxCubes, 60, 80);      // Make inner cubes slightly brighter for depth
      stroke(hue, 90, lightness);                       // Apply the rainbow color to the stroke

      let currentSize = baseSize * pow(scaleFactor, i); // Determine cube size based on its index

      push(); // Save current transformation state
      rotateX(i * angleStep * 0.2); // Apply individual X rotation offset
      rotateY(i * angleStep * 0.3); // Apply individual Y rotation offset
      rotateZ(i * angleStep * 0.1); // Apply individual Z rotation offset
      box(currentSize);             // Draw the 3D cube
      pop();  // Restore transformation state
    }
  }

  updateAnimation(); // Advance the animation state
  baseHue += hueSpeed; // Shift the rainbow colors over time
}

function updateAnimation() {
  counts += animSpeed; // Increment the transition progress

  if (counts >= maxCubes) {      // If the current phase is finished
    counts = 0;                  // Reset progress counter
    animState = (animState + 1) % 6; // Move to the next state in the 0-5 loop
  }
}

function mousePressed() {
  cursor('grabbing'); // Show a closed hand while dragging
}

function mouseReleased() {
  cursor('grab'); // Show an open hand when not dragging
}

function mouseDragged() {
  offsetX += mouseX - pmouseX; // Follow the mouse horizontally
  offsetY += mouseY - pmouseY; // Follow the mouse vertically
  return false;                // Prevent the page from scrolling on touch screens
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight); // Adjust canvas size on browser window resize
  baseSize = min(width, height) * 0.9;     // Recalculate base cube size to maintain 90% scale
}