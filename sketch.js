const K = 8.99e9; // Coulomb's law constant

const STATIC_PARTICLE_CHARGE = 1e-9; // coulombs

const DYNAMIC_PARTICLE_CHARGE = 1e-9; // coulombs
const DYNAMIC_PARTICLE_MASS = 3e-9; // kilograms
const DYNAMIC_PARTICLE_SUBSTEPS = 25;

const PIXELS_PER_METER = 100;
const METERS_PER_PIXEL = 1 / PIXELS_PER_METER;

const TRACER_STEPS_PER_FRAME = 10;
const TRACER_STEP_DISTANCE = 0.025; // meters
const TRACER_ARROW_SIZE = 3; // pixels

// Effectively a particle with infinite mass so it won't ever move
class StaticParticle {
  constructor(x, y, charge) {
    this.x = x;
    this.y = y;
    this.charge = charge;
  }
  
  draw(g) {
    if (this.charge > 0) {
      g.fill(255, 0, 0); // Red
    } else {
      g.fill(0, 0, 255); // Blue
    }
    
    g.ellipseMode(CENTER);
    g.strokeWeight(METERS_PER_PIXEL);
    g.stroke(0);
    g.ellipse(this.x, this.y, 15 * METERS_PER_PIXEL, 15 * METERS_PER_PIXEL);
  }
}

function getNetElecPotential(particles, x, y) {
  let netPotentialX = 0;
  let netPotentialY = 0;
  let closestDist = Infinity;
  
  for (let particle of particles) {
    let dx = x - particle.x;
    let dy = y - particle.y;
    let distSquared = dx * dx + dy * dy;
    let dist = sqrt(distSquared);

    let elecPotential = K * particle.charge / distSquared;
    netPotentialX += dx / dist * elecPotential;
    netPotentialY += dy / dist * elecPotential;
    
    if (dist < closestDist) {
      closestDist = dist;
    }
  }
  
  return {x: netPotentialX, y: netPotentialY, closestDist: closestDist};
}

class DynamicParticle {
  constructor(x, y, charge, mass) {
    this.x = x;
    this.y = y;
    this.charge = charge;
    this.mass = mass;
  
    this.velX = this.velY = 0;
  }
  
  updateAndDraw(g, particles, totalDt) {
    for (let i = 0; i < DYNAMIC_PARTICLE_SUBSTEPS; i++) {
      let {x: netX, y: netY, closestDist} = getNetElecPotential(particles, this.x, this.y);
      
      // Too close to particle, reaches limits of numerical precision, so
      // stop here to prevent achieving ludicrous speed
      if (closestDist < 4 / PIXELS_PER_METER)
        return;
      
      // Calculate electric force from potential
      netX *= this.charge;
      netY *= this.charge;
      
      let accelX = netX / this.mass;
      let accelY = netY / this.mass;
      
      let dt = totalDt / DYNAMIC_PARTICLE_SUBSTEPS;
      this.velX += accelX * dt;
      this.velY += accelY * dt;
      this.x += this.velX * dt;
      this.y += this.velY * dt;
    }
    
    g.ellipseMode(CENTER);
    g.strokeWeight(METERS_PER_PIXEL);
    g.stroke(0);
    g.fill(255, 255, 0); // Yellow
    g.ellipse(this.x, this.y, 10 * METERS_PER_PIXEL, 10 * METERS_PER_PIXEL);
  }
}

class FlowLineTracer {
  // Direction should be 1 for tracing away from positive particles,
  // and -1 for tracing away from negative particles
  constructor(x, y, direction) {
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.distSinceArrow = 0;
  }
  
  updateAndDraw(g, particles, arrowSpacing) {
    for (let i = 0; i < TRACER_STEPS_PER_FRAME; i++) {
      let prevX = this.x;
      let prevY = this.y;
      
      let {x: netX, y: netY} = getNetElecPotential(particles, this.x, this.y);
      
      // Normalize direction
      let netPotential = sqrt(netX * netX + netY * netY);
      let dirX = netX / netPotential;
      let dirY = netY / netPotential;
      
      // Move slightly in the direction (differential equation approx)
      // Multiply by direction so we step in reverse when tracing away
      // from negative particle
      this.x += dirX * TRACER_STEP_DISTANCE * this.direction;
      this.y += dirY * TRACER_STEP_DISTANCE * this.direction;
      
      g.strokeWeight(METERS_PER_PIXEL);
      g.stroke(0);
      g.line(prevX, prevY, this.x, this.y);
      
      if (arrowSpacing > 0) {
        this.distSinceArrow += TRACER_STEP_DISTANCE;
        if (this.distSinceArrow >= arrowSpacing) {
          this.distSinceArrow -= arrowSpacing;
          
          // Towards the left of the line
          let normalX = -dirY;
          let normalY = dirX;
          
          let x = this.x;
          let y = this.y;
          let s = TRACER_ARROW_SIZE * METERS_PER_PIXEL;
          g.line(x, y, x + (normalX - dirX) * s, y + (normalY - dirY) * s);
          g.line(x, y, x + (-normalX - dirX) * s, y + (-normalY - dirY) * s);
        }
      }
    }
  }
}

let font;

let fieldGraphics;
let dynamicsGraphics;

let particles = [];
let tracers = [];
let dynamics = [];

let tracersPerParticle = 20;
let arrowsEnabled = true;
let arrowSpacing = 1; // meters

function preload() {
  font = loadFont("assets/Roboto-Light.ttf");
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  
  fieldGraphics = createGraphics(windowWidth, windowHeight);
  dynamicsGraphics = createGraphics(windowWidth, windowHeight);
  clearFieldGraphics();
  clearDynamicsGraphics();
  
  // Disable right click menu
  document.oncontextmenu = function() { return false; };
  
  textFont(font);
  textSize(11);
  frameRate(30);
}

function clearFieldGraphics() {
  fieldGraphics.background(150);
}

function clearDynamicsGraphics() {
  dynamicsGraphics.clear();
}

function clearField() {
  clearFieldGraphics();
  tracers = [];
  
  // Make new tracers from each particle
  for (let particle of particles) {
    for (let i = 0; i < tracersPerParticle; i++) {
      let angle = i / tracersPerParticle * TWO_PI;
      
      let x = particle.x + 0.01 * cos(angle);
      let y = particle.y + 0.01 * sin(angle);
      let direction = particle.charge > 0 ? 1 : -1;
      
      tracers.push(new FlowLineTracer(x, y, direction));
    }
  }
}

function clearAll() {
  clearFieldGraphics();
  clearDynamicsGraphics();
  
  particles = [];
  tracers = [];
  dynamics = [];
}

// Transform from pixels to meters
function setUpCoordinates(g) {
  g.translate(g.width / 2, g.height / 2);
  g.scale(PIXELS_PER_METER, -PIXELS_PER_METER);
}

function draw() {
  fieldGraphics.push();
  setUpCoordinates(fieldGraphics);
  for (let tracer of tracers) {
    tracer.updateAndDraw(fieldGraphics, particles, arrowsEnabled ? arrowSpacing : -1);
  }
  for (let particle of particles) {
    particle.draw(fieldGraphics);
  }
  fieldGraphics.pop();
  
  dynamicsGraphics.push();
  setUpCoordinates(dynamicsGraphics);
  for (let particle of dynamics) {
    particle.updateAndDraw(dynamicsGraphics, particles, 1 / 30.0);
  }
  dynamicsGraphics.pop();
  
  image(fieldGraphics, 0, 0);
  image(dynamicsGraphics, 0, 0);
  
  fill(196);
  stroke(0);
  strokeWeight(1);
  rect(0, 0, textWidth("Left/right arrows to change arrow spacing") + 10, 205);
  
  fill(0);
  text("Left click to place positive particle", 4, 15);
  text("Right click to place negative particle", 4, 30);
  text("Space to clear screen and particles", 4, 45);
  
  text("Up/down arrows to change line density", 4, 70);
  text("Current density: " + tracersPerParticle + " lines/particle", 4, 85);
  
  text("Press A to toggle arrows", 4, 110);
  text("Arrows are: " + (arrowsEnabled ? "ON" : "OFF"), 4, 125);
  text("Left/right arrows to change arrow spacing", 4, 140);
  text("Current arrow spacing: " + nf(arrowSpacing, 0, 1), 4, 155);
  
  text("Press P to place dynamic (+) particle", 4, 180);
  text("Press C to remove all dynamic particles", 4, 195);
}

function getMousePosition() {
  return {
    x: (mouseX - width/2) / PIXELS_PER_METER,
    y: (height/2 - mouseY) / PIXELS_PER_METER
  };
}

// Always fill the whole screen
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  
  fieldGraphics = createGraphics(windowWidth, windowHeight);
  dynamicsGraphics = createGraphics(windowWidth, windowHeight);
  clearField();
  clearDynamicsGraphics();
}

function mousePressed() {
  let {x, y} = getMousePosition();
  let charge = mouseButton == LEFT ? STATIC_PARTICLE_CHARGE : -STATIC_PARTICLE_CHARGE;
  
  particles.push(new StaticParticle(x, y, charge));
  clearField();
  clearDynamicsGraphics();
}

function keyPressed() {
  if (key == ' ') {
    clearAll();
  } else if (key == 'a') {
    arrowsEnabled = !arrowsEnabled;
    clearField();
  } else if (key == 'p') {
    let {x, y} = getMousePosition();
    dynamics.push(new DynamicParticle(x, y, DYNAMIC_PARTICLE_CHARGE, DYNAMIC_PARTICLE_MASS));
  } else if (key == 'c') {
    clearDynamicsGraphics();
    dynamics = [];
  } else if (key == 'ArrowRight' && arrowSpacing < 4.0) {
    arrowSpacing += 0.1;
    if (arrowsEnabled)
      clearField();
  } else if (key == 'ArrowLeft' && arrowSpacing > 0.2) {
    arrowSpacing -= 0.1;
    if (arrowsEnabled)
      clearField();
  } else if (key == 'ArrowUp' && tracersPerParticle < 64) {
    tracersPerParticle++;
    clearField();
  } else if (key == 'ArrowDown' && tracersPerParticle > 4) {
    tracersPerParticle--;
    clearField();
  }
}
