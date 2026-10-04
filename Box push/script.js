var canvas = document.getElementById("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
var gl;
var playerOnTile;
var lv = 0;
var zoom = 1;
var maxLevel = 0;
var stars = [];
var moves = 0;
if (localStorage.level) {
  maxLevel = JSON.parse(localStorage.level);
} else {
  localStorage.level = JSON.stringify(maxLevel);
}
if (localStorage.stars) {
  stars = JSON.parse(localStorage.stars);
} else {
  localStorage.stars = JSON.stringify(stars);
}

function downloadProgress(name) {
  const text = `${localStorage.level}$${localStorage.stars}`;
  const blob = new Blob([text], { type: 'text/plain' });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name + ".txt";
  link.click();

  // Clean up the object URL after use
  URL.revokeObjectURL(link.href);
}

function initGL() {
  gl = canvas.getContext("experimental-webgl");
  if (!gl) {
    alert("Unable to initialize WebGL. Your browser may not support it.");
    return;
  }

  // Enable depth testing
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL); // Near things obscure far things

  // Clear color and depth buffer
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
}
initGL();

function initViewport() {
  gl.viewport(0, 0, canvas.width, canvas.height);
}
initViewport();

var vertexShaderSource = `
    precision mediump float; // Specify precision for floats
    attribute vec3 vertexPos;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    void main(void) {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(vertexPos, 1.0);
    }
`;

var fragmentShaderSource = `
    precision mediump float; // Specify precision for floats
    uniform vec4 color;
    void main(void) {
        gl_FragColor = color;
    }
`;

function createShader(type, source) {
  var shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) === false) {
    console.error("Error compiling shader: " + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

var vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
var fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

var shaderProgram = gl.createProgram();
gl.attachShader(shaderProgram, vertexShader);
gl.attachShader(shaderProgram, fragmentShader);
gl.linkProgram(shaderProgram);

if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
  console.error(
    "Error linking program: " + gl.getProgramInfoLog(shaderProgram),
  );
}

gl.useProgram(shaderProgram);

// Get the attribute and uniform locations
var shaderVertexPositionAttribute = gl.getAttribLocation(
  shaderProgram,
  "vertexPos",
);
var shaderModelViewMatrixUniform = gl.getUniformLocation(
  shaderProgram,
  "modelViewMatrix",
);
var shaderProjectionMatrixUniform = gl.getUniformLocation(
  shaderProgram,
  "projectionMatrix",
);
var shaderColorUniform = gl.getUniformLocation(shaderProgram, "color");

gl.enableVertexAttribArray(shaderVertexPositionAttribute);
var modelViewMatrix = new Float32Array([
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  -5,
  1, // Move back on the z-axis
]);

var fieldOfView = (45 * Math.PI) / 180; // in radians
var aspect = canvas.width / canvas.height;
var near = 0.1;
var far = 100.0;
var show = false;

projectionMatrix = new Float32Array([
  1 / (aspect * Math.tan(fieldOfView / 2)),
  0,
  0,
  0,
  0,
  1 / Math.tan(fieldOfView / 2),
  0,
  0,
  0,
  0,
  -(far + near) / (far - near),
  -1,
  0,
  0,
  -(2 * far * near) / (far - near),
  0,
]);

function drawHLSquare(r, g, b, a, x, y, z, height, length) {
  // Set the color uniform
  gl.uniform4f(shaderColorUniform, r / 255, g / 255, b / 255, a);

  // Create the vertex buffer for the square
  var vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  var verts = [
    x,
    y,
    z, // Bottom-left
    x,
    y,
    z + length, // Bottom-right
    x,
    y + height,
    z, // Top-left
    x,
    y + height,
    z + length, // Top-right
  ];

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

  // Bind the vertex buffer and draw
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.vertexAttribPointer(
    shaderVertexPositionAttribute,
    3,
    gl.FLOAT,
    false,
    0,
    0,
  );

  gl.uniformMatrix4fv(shaderProjectionMatrixUniform, false, projectionMatrix);
  gl.uniformMatrix4fv(shaderModelViewMatrixUniform, false, modelViewMatrix);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // Draw the square
}
function rotateX(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]);
}

function rotateY(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]);
}

function rotateZ(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
function rotateCameraTo(rtx, rty, rtz) {
  const rotationX = rotateX(rtx);
  const rotationY = rotateY(rty);
  const rotationZ = rotateZ(rtz);

  // Combine the rotations into a single matrix
  const combinedRotation = mat4Multiply(
    rotationZ,
    mat4Multiply(rotationY, rotationX),
  );

  // Update the modelViewMatrix to include the rotation
  modelViewMatrix = mat4Multiply(combinedRotation, modelViewMatrix);
}
function mat4Multiply(a, b) {
  const result = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result[i * 4 + j] =
        a[i * 4] * b[j] +
        a[i * 4 + 1] * b[j + 4] +
        a[i * 4 + 2] * b[j + 8] +
        a[i * 4 + 3] * b[j + 12];
    }
  }
  return result;
}
gl.enable(gl.DEPTH_TEST);

function drawWHSquare(r, g, b, a, x, y, z, width, height) {
  // Set the color uniform
  gl.uniform4f(shaderColorUniform, r / 255, g / 255, b / 255, a);

  // Create the vertex buffer for the square
  var vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

  var verts = [
    x,
    y,
    z, // Bottom-left
    x + width,
    y,
    z, // Bottom-right
    x,
    y + height,
    z, // Top-left
    x + width,
    y + height,
    z, // Top-right
  ];

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

  // Bind the vertex buffer and draw
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.vertexAttribPointer(
    shaderVertexPositionAttribute,
    3,
    gl.FLOAT,
    false,
    0,
    0,
  );

  gl.uniformMatrix4fv(shaderProjectionMatrixUniform, false, projectionMatrix);
  gl.uniformMatrix4fv(shaderModelViewMatrixUniform, false, modelViewMatrix);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // Draw the square
}
function drawWLSquare(r, g, b, a, x, y, z, width, height) {
  // Set the color uniform
  gl.uniform4f(shaderColorUniform, r / 255, g / 255, b / 255, a);

  // Create the vertex buffer for the square
  var vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

  var verts = [
    x,
    y,
    z, // Bottom-left
    x + width,
    y,
    z, // Bottom-right
    x,
    y,
    z + height, // Top-left
    x + width,
    y,
    z + height, // Top-right
  ];

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

  // Bind the vertex buffer and draw
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.vertexAttribPointer(
    shaderVertexPositionAttribute,
    3,
    gl.FLOAT,
    false,
    0,
    0,
  );

  gl.uniformMatrix4fv(shaderProjectionMatrixUniform, false, projectionMatrix);
  gl.uniformMatrix4fv(shaderModelViewMatrixUniform, false, modelViewMatrix);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // Draw the square
}
function drawcube(r, g, b, a, x, y, z, width, height, length) {
  drawWHSquare(
    r,
    g,
    b,
    a,
    x / zoom,
    y / zoom,
    z / zoom,
    width / zoom,
    height / zoom,
  );
  drawWHSquare(
    r,
    g,
    b,
    a,
    x / zoom,
    y / zoom,
    (z + length) / zoom,
    width / zoom,
    height / zoom,
  );
  drawHLSquare(
    r - 50,
    g - 50,
    b - 50,
    a,
    (x + width) / zoom,
    y / zoom,
    z / zoom,
    height / zoom,
    length / zoom,
  );
  drawHLSquare(
    r - 50,
    g - 50,
    b - 50,
    a,
    x / zoom,
    y / zoom,
    z / zoom,
    height / zoom,
    length / zoom,
  );
  drawWLSquare(
    r - 75,
    g - 75,
    b - 75,
    a,
    x / zoom,
    (y + height) / zoom,
    z / zoom,
    width / zoom,
    length / zoom,
  );
  drawWLSquare(
    r - 75,
    g - 75,
    b - 75,
    a,
    x / zoom,
    y / zoom,
    z / zoom,
    width / zoom,
    length / zoom,
  );
}
function drawShape(r, g, b, a, vertices, indices, type) {
  // Set the color uniform
  gl.uniform4f(shaderColorUniform, r / 255, g / 255, b / 255, a);

  // Create the vertex buffer for the vertices
  var vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

  // Create the index buffer for the indices
  var indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW,
  );

  // Bind the vertex buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.vertexAttribPointer(
    shaderVertexPositionAttribute,
    3,
    gl.FLOAT,
    false,
    0,
    0,
  );

  // Set uniforms for the matrices
  gl.uniformMatrix4fv(shaderProjectionMatrixUniform, false, projectionMatrix);
  gl.uniformMatrix4fv(shaderModelViewMatrixUniform, false, modelViewMatrix);
  gl.drawElements(type, indices.length, gl.UNSIGNED_SHORT, 0);
}
rotateCameraTo(-1.5, 0, 0);
////////////////////////////
////   /////// /////////////
//// ///////// /////////////
//// ///   /   / __/////////
//// /// / / / / __/////////
////   /   /   / __/////////
////////////////////////////
var keys = {};
window.addEventListener("keydown", function (e) {
  keys[e.key] = true;
  if (document.getElementById("dark").style.display == "none") {
    if ((keys["w"] || keys["ArrowUp"]) && player.x == player.realX && player.z == player.realZ) {
      movePlayer(0, -1, true);
      playerDir = "top";
    }

    if ((keys["s"] || keys["ArrowDown"]) && player.x == player.realX && player.z == player.realZ) {
      movePlayer(0, 1, true);
      playerDir = "bottom";
    }
    if ((keys["a"] || keys["ArrowLeft"]) && player.x == player.realX && player.z == player.realZ) {
      movePlayer(-1, 0, true);
      playerDir = "left";
    }
    if ((keys["d"] || keys["ArrowRight"]) && player.x == player.realX && player.z == player.realZ) {
      movePlayer(1, 0, true);
      playerDir = "right";
    }
  }
  if (e.ctrlKey && e.keys === "z") {
    boxes = JSON.parse(moved[moves - 1].boxes); bins = JSON.parse(moved[moves - 1].bins); player = JSON.parse(moved[moves - 1].player); moves -= 1; moved.pop();
  }
});
window.addEventListener("keyup", function (e) {
  keys[e.key] = false;
});
var levels = [
  ["!!!!!!!!",
    "!@#####!",
    "!###1##!",
    "!#####a!",
    "!!!!!!!!"],
  [
    "!!!!!",
    "!@1a!",
    "!#2b!",
    "!#3c!",
    "!!!!!"],
  [
    "!!!!!!!!!!!",
    "!@########!",
    "!##!1####a!",
    "!#2#######!",
    "!########b!",
    "!!!!!!!!!!!",
  ],
  [
    "!!!!!!!!!!",
    "!@#######!",
    "!######1a!",
    "!a#######!",
    "!#######1!",
    "!########!",
    "!!!!!!!!!!",
  ],
  ["@#####1##a"],
  ["     1#####1a",
    "@#####       "],
  [
    "  ## ### ",
    "@##1$###a",
    "  #####  ",
    "   ####  "
  ],
  ["$$$$$     ",
    "@#1#$     ",
    "$$$#$$$$$$",
    "  $#####a$",
    "  $$$$$$$$"
  ],
  [
    "!!!!###",
    "!!#1###",
    "!!a!!##",
    "!!1!a##",
    "!a1a###",
    "!!1!###",
    "##a#1##",
    "@######"
  ],
  [
    "@# ##b",
    "#2$###",
    "##a#1#",
    "    $$"
  ],
  ["$$$      ",
    "@########",
    "#c3$#1##b",
    "#2%$#####",
    "a#c$#####",
    "$$#$###3#",
    "#########",
    "$$$$$$$$$"
  ],
  ["   $$ $$ ",
    "@###%%%##",
    "#3#c$  c$",
    "##!2$  3 ",
    "b  %  #% ",
    "   ######",
    "   ######",
    "   $$$$$$"
  ],
  [
    "  @%b#3##$",
    " ##!$$$$#$",
    " 22 2   #",
    "%%bac%3##",
    "%3c3b####",
    "$#2%1%$$",
    "$$%%%%",
    "  c"
  ],
  [
    " $$$$       ",
    " ##1$       ",
    " 1$  $$$$   ",
    " # $@#1#1   ",
    "#c#2a##a##ab",
    "$###%#a3##  ",
    " $%%%$####  ",
    "      $$    "
  ],
  [
    "@######$",
    "###1111$",
    "#######",
    "a##a###",
    "a#a"
  ],
  [
    "@",
    "1",
    "v",
    "v",
    "#",
    "#",
    "a"
  ],
  [
    " @ ",
    "$1 ",
    "$^ ",
    "$va",
    " ^ "
  ],
  [
    "   @ ",
    "  $1 ",
    "$$$^ ",
    "$3%vc",
    "   ^ ",
    "   a "
  ],
  [
    "  @  ",
    "  #4v",
    "  #5v",
    "    *",
    "    c"
  ],
  [
    "@######",
    "###6  $",
    "##5v  $",
    "##4v  $",
    "##4v  $",
    "###v  $",
    "   *$$$",
    "   b   ",
    "   c   "
  ],
  [
    "@####     ",
    "#4v$# ",
    "#$*4#####",
    " v*##^56#",
    " bc    ^"
  ],
  [
    "   $$ ",
    "@###1",
    "v   v",
    "v v<<",
    "##va^",
    "  >>^"
  ],
  [
    "@#########",
    "#1########",
    "##>>$<v><v",
    "##v$a<vv<<",
    "##>^<^<>^<"
  ],
  [
    "@#######################c",
    "#64*#45#",
    "#############b",
    "$$$$$$"
  ]

];
var levelMoves1 = [8, 7, 34, 23, 8, 12, 17, 13, 25, 22, 72, 58, 79, 139, 53, 3, 6, 10, 6, 33, 42, 13, "--", 73];
var levelMoves2 = [9, "--", 36, 25, "--", "--", 19, 15, 28, 25, 75, 60, 85, 150, 56, "--", 7, 11, 7, 35, 45, "--", "--", 75];
var levelMoves3 = [10, "--", 40, 30, "--", "--", 23, 17, 31, 28, 80, 62, 88, 160, 62, "--", "--", "--", "--", 38, 48, "--", "--", 80];
var levelNames = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, "13 ☠ Hard", "14 ☠ Hard", 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
/*
@ = player
# = floor
$ = box
= = bin
*/
var tiles = [];
var player = {};
var boxes = [];
var bins = [];
var camera = { x: 3, y: 3, z: 3 };
var moved = [];
var playerDir = "bottom";
var confetiis = [];
var exclamation = 0;
var shake = 0;
function setup(level) {
  exclamation = 0;
  shake = 0;
  confetiis = [];
  lv = level;
  zoom = Math.max(levels[lv][0].length, levels[lv].length) / 3;
  moved = [];
  moves = 0;
  document.getElementById("dark").style.display = "none";
  document.getElementById("centerBox").style.display = "none";
  tiles = [];
  boxes = [];
  bins = [];
  for (var i = 0; i < levels[level].length; i++) {
    for (var j = 0; j < levels[level][i].length; j++) {
      switch (levels[level][i].substring(j, j + 1)) {
        case "#": {
          //Normal tiles
          tiles.push({ x: j * 1, z: i * 1, type: 1 });
          break;
        }
        case "$": {
          //stair tiles
          tiles.push({ x: j * 1, z: i * 1, type: 3 });
          break;
        }
        case "%": {
          //Green box tiles
          tiles.push({ x: j * 1, z: i * 1, type: 4 });
          break;
        }
        case "@": {
          //player spawn position
          tiles.push({ x: j * 1, z: i * 1, type: 1 });
          player = { x: j * 1, y: 1, z: i * 1, realX: j, realZ: i };
          break;
        }
        case "1": {
          //Orange box
          tiles.push({ x: j * 1, z: i * 1, type: 1 });
          boxes.push({
            x: j * 1,
            y: 1,
            z: i * 1,
            realX: j,
            realZ: i,
            r: 128,
            g: 60,
            b: 0,
          });
          break;
        }
        case "a": {
          //Orange bin
          tiles.push({ x: j * 1, z: i * 1, type: 1 });
          bins.push({ x: j * 1, y: 1, z: i * 1, r: 128, g: 60, b: 0 });
          break;
        }
        case "2": {
          tiles.push({ x: j * 1, z: i * 1, type: 1 });
          boxes.push({
            x: j * 1,
            y: 1,
            z: i * 1,
            realX: j,
            realZ: i,
            r: 128,
            g: 128,
            b: 0,
          });
          break;
        }
        case "b": {
          tiles.push({ x: j * 1, z: i * 1, type: 1 });
          bins.push({ x: j * 1, y: 1, z: i * 1, r: 128, g: 128, b: 0 });
          break;
        }
        case "3": {
          tiles.push({ x: j * 1, z: i * 1, type: 1 });
          boxes.push({
            x: j * 1,
            y: 1,
            z: i * 1,
            realX: j,
            realZ: i,
            r: 0,
            g: 128,
            b: 0,
          });
          break;
        }
        case "4": {
          tiles.push({ x: j * 1, z: i * 1, type: 1 });
          boxes.push({
            x: j * 1,
            y: 1,
            z: i * 1,
            realX: j,
            realZ: i,
            r: 0,
            g: 0,
            b: 0,
          });
          break;
        }
        case "5": {
          tiles.push({ x: j * 1, z: i * 1, type: 1 });
          boxes.push({
            x: j * 1,
            y: 1,
            z: i * 1,
            realX: j,
            realZ: i,
            r: 0,
            g: 255,
            b: 0,
          });
          break;
        }
        case "6": {
          tiles.push({ x: j * 1, z: i * 1, type: 1 });
          boxes.push({
            x: j * 1,
            y: 1,
            z: i * 1,
            realX: j,
            realZ: i,
            r: 255,
            g: 255,
            b: 0,
          });
          break;
        }
        case "7": {
          tiles.push({ x: j * 1, z: i * 1, type: 1 });
          boxes.push({
            x: j * 1,
            y: 1,
            z: i * 1,
            realX: j,
            realZ: i,
            r: 255,
            g: 120,
            b: 0,
          });
          break;
        }
        case "c": {
          tiles.push({ x: j * 1, z: i * 1, type: 1 });
          bins.push({ x: j * 1, y: 1, z: i * 1, r: 0, g: 128, b: 0 });
          break;
        }
        case "!": {
          //wall
          tiles.push({ x: j * 1, z: i * 1, type: 2 });
          break;
        }
        case "v": {
          //Downwards conveyor belt
          tiles.push({ x: j * 1, z: i * 1, type: 5 });
          break;
        }
        case "^": {
          //Upwards conveyor belt
          tiles.push({ x: j * 1, z: i * 1, type: 6 });
          break;
        }
        case "*": {
          //Box mixer
          tiles.push({ x: j * 1, z: i * 1, type: 7 });
          break;
        }
        case "<": {
          //Box mixer
          tiles.push({ x: j * 1, z: i * 1, type: 8 });
          break;
        }
        case ">": {
          //Box mixer
          tiles.push({ x: j * 1, z: i * 1, type: 9 });
          break;
        }
      }
    }
  }
  document.getElementById("starTable").innerHTML = `<table><tr><th>Moves</th><th>Stars</th></tr><tr><td>${levelMoves1[lv]}</td><td>3</td></tr><tr><td>${levelMoves2[lv]}</td><td>2</td></tr><tr><td>${levelMoves3[lv]}</td><td>1</td></tr></table>`;
}
function render() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  drawcube(
    150,
    60,
    150,
    1.0,
    player.x - camera.x,
    player.y - camera.y,
    player.z - camera.z,
    1,
    1,
    1,
  );
  drawcube(
    0,
    0,
    0,
    1.0,
    player.x - camera.x + (playerDir == "bottom" ? 0.2 : (playerDir == "top" ? 0.2 : (playerDir == "left" ? -0.1 : 0.9))),
    player.y - camera.y + 0.6,
    player.z - camera.z + (playerDir == "bottom" ? 0.9 : (playerDir == "top" ? -0.1 : 0.2)),
    0.2,
    0.2,
    0.2
  );
  drawcube(
    0,
    0,
    0,
    1.0,
    player.x - camera.x + (playerDir == "bottom" ? 0.6 : (playerDir == "top" ? 0.6 : (playerDir == "left" ? -0.1 : 0.9))),
    player.y - camera.y + 0.6,
    player.z - camera.z + (playerDir == "bottom" ? 0.9 : (playerDir == "top" ? -0.1 : 0.6)),
    0.2,
    0.2,
    0.2
  );
  drawcube(
    150,
    60,
    150,
    1.0,
    player.x - camera.x + (playerDir == "bottom" ? 0.1 : (playerDir == "top" ? 0.1 : (playerDir == "left" ? -0.2 : 1))),
    player.y - camera.y + 0.4,
    player.z - camera.z + (playerDir == "bottom" ? 1 : (playerDir == "top" ? -0.2 : 0.1)),
    0.2,
    0.2,
    0.2
  );
  drawcube(
    150,
    60,
    150,
    1.0,
    player.x - camera.x + (playerDir == "bottom" ? 0.7 : (playerDir == "top" ? 0.7 : (playerDir == "left" ? -0.2 : 1))),
    player.y - camera.y + 0.4,
    player.z - camera.z + (playerDir == "bottom" ? 1 : (playerDir == "top" ? -0.2 : 0.7)),
    0.2,
    0.2,
    0.2
  );
  if (exclamation > 0) {
    exclamation--;
    drawcube(
      255,
      255,
      255,
      1.0,
      player.x - camera.x + 0.4,
      player.y - camera.y + 3 - (exclamation) / 20,
      player.z - camera.z + 0.4,
      0.2,
      0.2,
      0.2
    );
    drawcube(
      255,
      255,
      255,
      1.0,
      player.x - camera.x + 0.4,
      player.y - camera.y + 3.4 - (exclamation) / 20,
      player.z - camera.z + 0.4,
      0.2,
      0.6,
      0.2
    );
  }
  for (var i = 0; i < confetiis.length; i++) {
    drawcube(
      confetiis[i].r,
      confetiis[i].g,
      confetiis[i].b,
      1.0,
      confetiis[i].x - camera.x,
      confetiis[i].y - camera.y,
      confetiis[i].z - camera.z,
      0.1,
      0.1,
      0.1
    );
    confetiis[i].x += confetiis[i].xvel;
    confetiis[i].y += confetiis[i].yvel;
    confetiis[i].z += confetiis[i].zvel;
    confetiis[i].yvel -= 0.001;
    if (confetiis[i].y < -10 || i > 120) {
      confetiis.splice(i, 1);
      i--;
      continue;
    }
  }
  for (var i = 0; i < tiles.length; i++) {
    switch (tiles[i].type) {
      case 1: {
        drawcube(
          150,
          150,
          150,
          1.0,
          tiles[i].x - camera.x,
          0 - camera.y,
          tiles[i].z - camera.z,
          1,
          1,
          1,
        );

        break;
      }
      case 2: {
        drawcube(
          180,
          180,
          180,
          1.0,
          tiles[i].x - camera.x,
          0 - camera.y,
          tiles[i].z - camera.z,
          1,
          2,
          1,
        );
        break;
      }
      case 3: {
        drawcube(
          180,
          180,
          180,
          1.0,
          tiles[i].x - camera.x,
          0 - camera.y,
          tiles[i].z - camera.z,
          1,
          1.1,
          1,
        );
        break;
      }
      case 4: {
        drawcube(
          180,
          255,
          180,
          1.0,
          tiles[i].x - camera.x,
          0 - camera.y,
          tiles[i].z - camera.z,
          1,
          1,
          1,
        );
        break;
      }
      case 5: {
        drawcube(
          100,
          100,
          100,
          1.0,
          tiles[i].x - camera.x,
          0 - camera.y,
          tiles[i].z - camera.z,
          1,
          1,
          1,
        );
        drawcube(
          150,
          150,
          150,
          1.0,
          tiles[i].x - camera.x,
          1 - camera.y,
          tiles[i].z - camera.z + (((ticknum * 4) % 100) / 100),
          1,
          0.1,
          0.1,
        );
        drawcube(
          150,
          150,
          150,
          1.0,
          tiles[i].x - camera.x,
          1 - camera.y,
          tiles[i].z - camera.z + ((((ticknum * 4) + 50) % 100) / 100),
          1,
          0.1,
          0.1,
        );
        break;
      }
      case 6: {
        drawcube(
          100,
          100,
          100,
          1.0,
          tiles[i].x - camera.x,
          0 - camera.y,
          tiles[i].z - camera.z,
          1,
          1,
          1,
        );
        drawcube(
          150,
          150,
          150,
          1.0,
          tiles[i].x - camera.x,
          1 - camera.y,
          tiles[i].z - camera.z + (1 - ((ticknum * 4) % 100) / 100),
          1,
          0.1,
          0.1,
        );
        drawcube(
          150,
          150,
          150,
          1.0,
          tiles[i].x - camera.x,
          1 - camera.y,
          tiles[i].z - camera.z + (1 - (((ticknum * 4) + 50) % 100) / 100),
          1,
          0.1,
          0.1,
        );
        break;
      }
      case 7: {
        drawcube(
          (ticknum * 5) % 255,
          (ticknum * 5) % 255,
          (ticknum * 5) % 255,
          1.0,
          tiles[i].x - camera.x,
          0 - camera.y,
          tiles[i].z - camera.z,
          1,
          1,
          1,
        );
        break;
      }
      case 8: {
        drawcube(
          100,
          100,
          100,
          1.0,
          tiles[i].x - camera.x,
          0 - camera.y,
          tiles[i].z - camera.z,
          1,
          1,
          1,
        );
        drawcube(
          150,
          150,
          150,
          1.0,
          tiles[i].x - camera.x + (1 - ((ticknum * 4) % 100) / 100),
          1 - camera.y,
          tiles[i].z - camera.z,
          0.1,
          0.1,
          1,
        );
        drawcube(
          150,
          150,
          150,
          1.0,
          tiles[i].x - camera.x + (1 - ((((ticknum) * 4) + 50) % 100) / 100),
          1 - camera.y,
          tiles[i].z - camera.z,
          0.1,
          0.1,
          1,
        );
        break;
      }
      case 9: {
        drawcube(
          100,
          100,
          100,
          1.0,
          tiles[i].x - camera.x,
          0 - camera.y,
          tiles[i].z - camera.z,
          1,
          1,
          1,
        );
        drawcube(
          150,
          150,
          150,
          1.0,
          tiles[i].x - camera.x + (((ticknum * 4) % 100) / 100),
          1 - camera.y,
          tiles[i].z - camera.z,
          0.1,
          0.1,
          1,
        );
        drawcube(
          150,
          150,
          150,
          1.0,
          tiles[i].x - camera.x + (((((ticknum) * 4) + 50) % 100) / 100),
          1 - camera.y,
          tiles[i].z - camera.z,
          0.1,
          0.1,
          1,
        );
        break;
      }
    }
  }
  for (var i = 0; i < boxes.length; i++) {
    drawcube(
      boxes[i].r,
      boxes[i].g,
      boxes[i].b,
      1.0,
      boxes[i].x - camera.x + 0.2,
      boxes[i].y - camera.y,
      boxes[i].z - camera.z + 0.2,
      0.6,
      0.6,
      0.6,
    );
  }
  for (var i = 0; i < bins.length; i++) {
    drawcube(
      bins[i].r,
      bins[i].g,
      bins[i].b,
      1.0,
      bins[i].x - camera.x + 0.2,
      bins[i].y - camera.y,
      bins[i].z - camera.z + 0.2,
      0.6,
      0.1,
      0.6,
    );

  }
}
function update() {
  if (shake > 0) {
    camera.y = Math.random() - 0.5;
    shake--;
  } else {
    camera.y = 0;
  }
  if (keys["u"]) {
    rotateCameraTo(0.005, 0, 0);
  }
  if (keys["j"]) {
    rotateCameraTo(-0.005, 0, 0);
  }
  if (keys["h"]) {
    rotateCameraTo(0, 0, 0.005);
  }
  if (keys["k"]) {
    rotateCameraTo(0, 0, -0.005);
  }
  if (keys["y"]) {
    zoom -= 0.05;
  }
  if (keys["i"]) {
    zoom += 0.05;
  }
  if (player.z - camera.z > 1) {
    camera.z += 0.1;
  }
  if (player.z - camera.z < -1) {
    camera.z -= 0.1;
  }
  if (player.x - camera.x > 1) {
    camera.x += 0.1;
  }
  if (player.x - camera.x < -1) {
    camera.x -= 0.1;
  }
  if (player.z != player.realZ) {
    player.z +=
      (player.realZ - player.z) / Math.abs(player.realZ - player.z) / 25;
    if (Math.abs(player.z - player.realZ) < 0.01) {
      player.z = player.realZ;
    }
  }
  if (player.x != player.realX) {
    player.x +=
      (player.realX - player.x) / Math.abs(player.realX - player.x) / 25;
    if (Math.abs(player.x - player.realX) < 0.01) {
      player.x = player.realX;
    }
  }
  playerOnTile = false;
  for (var i = 0; i < tiles.length; i++) {
    if (
      Math.round(tiles[i].x) == Math.round(player.realX) &&
      Math.round(tiles[i].z) == Math.round(player.realZ)
    ) {
      if (player.x == tiles[i].x && player.z == tiles[i].z) {
        playerOnTile = tiles[i].type;
      } else {
        playerOnTile = true;
      }
    }
  }

  if (!playerOnTile || player.y != 1) {
    player.y -= 0.1;
    if (player.y < -5) {
      confetiiBomb(player.x, player.y, player.z, 150, 60, 150);
      player.y = 10000;
      setTimeout(function () { setup(lv) }, 1000);
    }
  }
  if (playerOnTile == 5) {
    movePlayer(0, 1, false);
  }
  if (playerOnTile == 6) {
    movePlayer(0, -1, false);
  }
  if (playerOnTile == 8) {
    movePlayer(-1, 0, false);
  }
  if (playerOnTile == 9) {
    movePlayer(1, 0, false);
  }
  for (var i = 0; i < boxes.length; i++) {
    // Smooth movement (already exists)
    if (boxes[i].z !== boxes[i].realZ) {
      boxes[i].z +=
        (boxes[i].realZ - boxes[i].z) /
        Math.abs(boxes[i].realZ - boxes[i].z) /
        25;
      if (Math.abs(boxes[i].z - boxes[i].realZ) < 0.01) {
        boxes[i].z = boxes[i].realZ;
      }
    }
    if (boxes[i].x !== boxes[i].realX) {
      boxes[i].x +=
        (boxes[i].realX - boxes[i].x) /
        Math.abs(boxes[i].realX - boxes[i].x) /
        25;
      if (Math.abs(boxes[i].x - boxes[i].realX) < 0.01) {
        boxes[i].x = boxes[i].realX;
      }
    }

    // Gravity logic for boxes
    let boxOnTile = false;
    for (let t = 0; t < tiles.length; t++) {
      if (
        Math.round(tiles[t].x) === Math.round(boxes[i].x) &&
        Math.round(tiles[t].z) === Math.round(boxes[i].z)
      ) {
        boxOnTile = true;
        if (tiles[t].type == 5 && boxes[i].realX == boxes[i].x && boxes[i].realZ == boxes[i].z) {
          moveBox(i, 0, 1);
        }
        if (tiles[t].type == 6 && boxes[i].realX == boxes[i].x && boxes[i].realZ == boxes[i].z) {
          moveBox(i, 0, -1);
        }
        if (tiles[t].type == 8 && boxes[i].realX == boxes[i].x && boxes[i].realZ == boxes[i].z) {
          moveBox(i, -1, 0);
        }
        if (tiles[t].type == 9 && boxes[i].realX == boxes[i].x && boxes[i].realZ == boxes[i].z) {
          moveBox(i, 1, 0);
        }
        break;
      }
    }

    if (!boxOnTile || boxes[i].y !== 1) {
      boxes[i].y -= 0.1;
      if (boxes[i].y < -5) {
        confetiiBomb(boxes[i].x, -5, boxes[i].z, boxes[i].r, boxes[i].g, boxes[i].b);
        boxes.splice(i, 1);
        i--;
        continue;
      }
      // Optional: Reset if box falls too far
    } else {
      boxes[i].y = 1; // Snap to tile
    }
    let l = boxes.length;
    for (var j = 0; j < boxes.length; j++) {
      if (boxes[i].x == boxes[j].x && boxes[i].z == boxes[j].z && i != j) {
        //mix
        boxes[j].r = Math.round((boxes[i].r + boxes[j].r) / 2);
        boxes[j].g = Math.round((boxes[i].g + boxes[j].g) / 2);
        boxes[j].b = Math.round((boxes[i].b + boxes[j].b) / 2);
        confetiiBomb(boxes[j].x, 1, boxes[j].z, boxes[j].r, boxes[j].g, boxes[j].b);
        boxes.splice(i, 1);
        i--;
        break;
      }
    }
    if (boxes.length != l) {
      continue;
    }
    for (var j = 0; j < bins.length; j++) {
      if (bins[j].x == boxes[i].x && bins[j].z == boxes[i].z && boxes[i].r == bins[j].r && boxes[i].g == bins[j].g && boxes[i].b == bins[j].b) {
        confetiiBomb(boxes[i].x, 1, boxes[i].z, boxes[i].r, boxes[i].g, boxes[i].b);
        boxes.splice(i, 1);
        bins.splice(j, 1);
        i--;
        break;
      }
    }

  }
  if (
    bins.length == 0 &&
    document.getElementById("dark").style.display == "none"
  ) {
    var earnedStars =
      moves <= levelMoves1[lv] || levelMoves1[lv] == "--"
        ? 3
        : moves <= levelMoves2[lv]
          ? 2
          : moves <= levelMoves3[lv]
            ? 1
            : 0;

    if (stars.length <= lv) {
      // Fill any missing values up to current level
      while (stars.length <= lv) stars.push(0);
    }

    if (earnedStars > stars[lv]) {
      stars[lv] = earnedStars;
    }

    localStorage.stars = JSON.stringify(stars);
    updateLevels();
    lv = parseInt(lv);
    maxLevel = parseInt(maxLevel);
    if (lv + 1 > maxLevel) {
      maxLevel = lv + 1;
      updateLevels();
      localStorage.level = JSON.stringify(maxLevel);
    }
    document.getElementById("win").style.display = "inline-block";
    document.getElementById("comment").innerHTML =
      earnedStars == 3
        ? "Excellent"
        : earnedStars == 2
          ? "Awesome"
          : earnedStars == 1
            ? "Good"
            : "Passable";
    document.getElementById("tip").innerHTML =
      earnedStars == 3
        ? "You solved this level with all 3 stars. Well done!"
        : earnedStars == 2
          ? "Tip: Come back and try completing this level using fewer moves to get all 3 stars."
          : earnedStars == 1
            ? "Tip: Come back and try completing this level using fewer moves to get more stars. Avoid doing extra moves and try pushing boxes in different order. You can do it."
            : "You passed! But that's too many moves. Come back and try using fewer moves to get stars. Avoid doing extra moves and try pushing boxes in different order.";
    document.getElementById("dark").style.display = "inline-block";
    document.getElementById("moves2").innerHTML = moves;
    showStars((moves <= levelMoves1[lv] || levelMoves1[lv] == "--" ? 3 : moves <= levelMoves2[lv] ? 2 : moves <= levelMoves3[lv] ? 1 : 0) == 3 ? 3 : (moves <= levelMoves1[lv] ? 3 : moves <= levelMoves2[lv] ? 2 : moves <= levelMoves3[lv] ? 1 : 0) == 2 ? 2 : (moves <= levelMoves1[lv] ? 3 : moves <= levelMoves2[lv] ? 2 : moves <= levelMoves3[lv] ? 1 : 0) == 1 ? 1 : 0);
  }
  document.getElementById("level").innerHTML = `${lv + 1}`;
  document.getElementById("moves").innerHTML = moves;
  document.getElementById("undo").style.display = moves > 0 ? "inline-block" : "none";
}

render();
var ticknum = 0;
function tick() {
  ticknum++;
  update();
  render();
  requestAnimationFrame(tick);
}
tick();
function boxCollisionPlayer() {
  for (var i = 0; i < boxes.length; i++) {
    if (boxes[i].realX == player.realX && boxes[i].realZ == player.realZ) {
      return i;
    }
  }
  return false;
}
function collisionBox(box) {
  for (var i = 0; i < boxes.length; i++) {
    if (
      boxes[i].realX == boxes[box].realX &&
      boxes[i].realZ == boxes[box].realZ &&
      i != box
    ) {
      return true;
    }
  }
  return false;
}
function moveBox(index, x, z) {
  var box = boxes[index];
  const targetZ = box.realZ + z;
  const targetX = box.realX + x;
  var clearPath = true;
  for (var i = 0; i < bins.length; i++) {
    if (
      bins[i].x == targetX &&
      bins[i].z == targetZ &&
      !(
        bins[i].r == box.r &&
        bins[i].g == box.g &&
        bins[i].b == box.b
      )
    ) {

      clearPath = false;
      break;
    }

  }
  for (var i = 0; i < boxes.length; i++) {
    if (boxes[i].realX == targetX && boxes[i].realZ == targetZ) {
      clearPath = false;
      break;
    }
  }
  for (var i = 0; i < tiles.length; i++) {
    if (tiles[i].x == targetX && tiles[i].z == targetZ && (tiles[i].type == 2 || tiles[i].type == 3 || (tiles[i].type == 4 && !(boxes[boxIndex].r == 0 && boxes[boxIndex].g > 0 && boxes[boxIndex].b == 0)))) {
      clearPath = false;
    }
    if (tiles[i].type == 7 && tiles[i].x == targetX && tiles[i].z == targetZ) {
      //For mix tiles
      clearPath = true;
    }
  }
  if (player.realX == targetX && player.realZ == targetZ) {
    clearPath = false;
  }
  if (clearPath) {
    boxes[index].realX = targetX;
    boxes[index].realZ = targetZ;
  }
}
function movePlayer(x, z, m) {
  var canMove = true;
  if (m) {
    moves++;
    moved.push({ boxes: JSON.stringify(boxes), bins: JSON.stringify(bins), player: JSON.stringify(player) });
  }
  const targetZ = player.realZ + z;
  const targetX = player.realX + x;

  // Check if there's a box at the target position
  let boxIndex = -1;
  for (let i = 0; i < boxes.length; i++) {
    if (boxes[i].realX === targetX && boxes[i].realZ === targetZ) {
      boxIndex = i;
      break;
    }
  }

  if (boxIndex !== -1 && player.y == 1) {
    // Attempt to push the box
    const pushZ = targetZ + z;
    const pushX = targetX + x;

    // Check for collision with other boxes
    var clearPath = true;
    for (let j = 0; j < boxes.length; j++) {
      if (boxes[j].realX === pushX && boxes[j].realZ === pushZ) {
        clearPath = false;
        break;
      }
    }

    // Check if there's a wall in the push location
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].x == pushX && tiles[i].z == pushZ && (tiles[i].type == 2 || tiles[i].type == 3 || (tiles[i].type == 4 && !(boxes[boxIndex].r == 0 && boxes[boxIndex].g > 0 && boxes[boxIndex].b == 0)))) {
        clearPath = false;
      }
      if (tiles[i].type == 7 && tiles[i].x == pushX && tiles[i].z == pushZ) {
        //For mix tiles
        clearPath = true;
      }
    }
    for (var i = 0; i < bins.length; i++) {
      if (
        bins[i].x == pushX &&
        bins[i].z == pushZ &&
        !(
          bins[i].r == boxes[boxIndex].r &&
          bins[i].g == boxes[boxIndex].g &&
          bins[i].b == boxes[boxIndex].b
        )
      ) {

        clearPath = false;
        break;
      }

    }

    if (clearPath) {
      // Move both box and player
      boxes[boxIndex].realZ += z;
      boxes[boxIndex].realX += x;
      player.realZ += z;
      player.realX += x;
    } else {
      canMove = false;
    }
  } else {
    var clearPath = true;
    for (var i = 0; i < tiles.length; i++) {
      if (
        tiles[i].x == targetX &&
        tiles[i].z == targetZ &&
        tiles[i].type == 2
      ) {
        clearPath = false;
      }
    }
    for (var i = 0; i < bins.length; i++) {
      if (bins[i].x == targetX && bins[i].z == targetZ) {
        clearPath = false;
      }
    }
    if (clearPath) {
      player.realZ += z;
      player.realX += x;
    } else {
      canMove = false;
    }
  }
  if (canMove == false && m) {
    moved.pop();
    moves--;
    exclamation = 50;
  }
}
function updateLevels() {
  document.getElementById("levels").innerHTML = "";
  for (var i = 0; i < maxLevel; i++) {
    document.getElementById("levels").innerHTML +=
      `<div id='level${i + 1}' class='levelBox' onclick='lv = ${i}; setup(lv);' title='Click here to enter level ${i + 1}'>${levelNames[i]}</div>`;
  }
  document.getElementById("levels").innerHTML +=
    `<div id='level${maxLevel + 1}' class='levelBox' title='Click here to enter level ${maxLevel + 1} and get access to the next level if you completed' onclick='lv = ${maxLevel}; setup(lv);'>${levelNames[maxLevel]}</div>`;
  document.getElementById("level" + (maxLevel + 1)).style.animation = "colorChange 1s infinite";
  for (var i = 0; i < stars.length; i++) {
    document.getElementById("level" + (i + 1)).innerHTML +=
      `<hr><span style='animation: stars 1s infinite;'>${stars[i] == 3 ? "⭐️⭐️⭐️" : stars[i] == 2 ? "⭐️⭐️☆" : stars[i] == 1 ? "⭐️☆☆" : "☆☆☆"}</span>`;
  }
}
updateLevels();
function showStars(s) {
  var canvas2 = document.getElementById("stars");
  var ctx2 = canvas2.getContext("2d");
  ctx2.clearRect(0, 0, 600, 200);
  ctx2.font = "200px Monospace";
  ctx2.fillStyle = "black";
  ctx2.fillText("☆", 50, 100);
  ctx2.fillText("☆", 250, 100);
  ctx2.fillText("☆", 450, 100);
  for (var i = 0; i < s; i++) {
    for (var j = 1; j < 33; j++) {
      eval(
        `setTimeout(function(){

          ctx2.font = "${j * 5}px Monospace";
          ctx2.fillStyle = "rgba(255, 255, ${255 - 255 * j / 33}, 1)";
          ctx2.fillText("★", ${i * 200 + 101.5 - (j * 1.25)}, ${50 + j * 1.25});
          
        }, ${j * 5 + i * 250});`

      );
    }
  }
}
var div = document.getElementById("levels");
div.scrollTo({
  left: div.scrollWidth,
  behavior: 'smooth'
});
function confetiiBomb(x, y, z, r, g, b) {
  shake += 10;
  for (var i = 0; i < 100; i++) {
    confetiis.unshift({ x: x, y: y, z: z, xvel: (Math.random() - 0.5) / 8, yvel: (Math.random() - 0.5) / 8, zvel: (Math.random() - 0.5) / 8, r: r, g: g, b: b });
  }
}