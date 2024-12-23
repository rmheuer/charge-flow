const K = 8.99e9; // Coulomb's law constant

const STATIC_PARTICLE_CHARGE = 1e-9; // coulombs

const DYNAMIC_PARTICLE_CHARGE = 1e-9; // coulombs
const DYNAMIC_PARTICLE_MASS = 3e-9; // kilograms
const DYNAMIC_PARTICLE_SUBSTEPS = 25;
const DYNAMIC_DIPOLE_SPACING = 0.5; // meters

const PIXELS_PER_METER = 100;
const METERS_PER_PIXEL = 1 / PIXELS_PER_METER;

const TRACER_STEPS_PER_FRAME = 25;
const TRACER_STEP_DISTANCE = 0.005; // meters
const TRACER_ARROW_SIZE = 3; // pixels

const TOO_CLOSE = 6 / PIXELS_PER_METER;

// Prevents ridiculous amounts of arrows close to particles
const MAX_ARROW_POTENTIAL = 50; // volts

function getColorForCharge(charge) {
  if (charge > 0) {
    return color(255, 0, 0); // Red
  } else {
    return color(0, 0, 255); // Blue
  }
}

// Effectively a particle with infinite mass so it won't ever move
class StaticParticle {
  constructor(x, y, charge) {
    this.x = x;
    this.y = y;
    this.charge = charge;
  }
  
  draw(g) {
    g.ellipseMode(CENTER);
    g.strokeWeight(METERS_PER_PIXEL);
    g.stroke(0);
    g.fill(getColorForCharge(this.charge));
    g.ellipse(this.x, this.y, 15 * METERS_PER_PIXEL, 15 * METERS_PER_PIXEL);
  }
}

function getElecField(particle, x, y) {
  let dx = x - particle.x;
  let dy = y - particle.y;
  let distSquared = dx * dx + dy * dy;
  let dist = sqrt(distSquared);

  let elecPotential = K * particle.charge / dist;
  let elecField = elecPotential / dist;
  return {
    x: dx / dist * elecField,
    y: dy / dist * elecField,
    pot: elecPotential,
    dist: dist
  };
}

function getNetElecField(particles, dynamics, x, y) {
  let netFieldX = 0;
  let netFieldY = 0;
  let totalPotential = 0;
  let closestDist = Infinity;
  
  for (let particle of particles) {
    let field = getElecField(particle, x, y);
    netFieldX += field.x;
    netFieldY += field.y;
    totalPotential += field.pot;

    if (field.dist < closestDist) {
      closestDist = field.dist;
    }
  }
  
  for (let dynamic of dynamics) {
    for (let location of dynamic.getChargeLocations()) {
      let field = getElecField(location, x, y);
      
      // This has two purposes:
      // 1. Prevent particle from trying to put force on itself
      // 2. Prevent particles that are too close from breaking the simulation
      if (field.dist > TOO_CLOSE) {
        netFieldX += field.x;
        netFieldY += field.y;
        
        // Don't bother with dynamic potential, it's not used
      }
    }
  }
  
  return {x: netFieldX, y: netFieldY, pot: totalPotential, closestDist: closestDist};
}

class DynamicParticle {
  constructor(x, y, charge, mass) {
    this.x = x;
    this.y = y;
    this.charge = charge;
    this.mass = mass;
  
    this.velX = this.velY = 0;
  }
  
  getChargeLocations() {
    return [
      {x: this.x, y: this.y, charge: this.charge}
    ];
  }
  
  update(particles, dynamics, dt) {
    let {x: netX, y: netY, closestDist} = getNetElecField(particles, dynamics, this.x, this.y);
      
    // Too close to particle, reaches limits of numerical precision, so
    // stop here to prevent achieving ludicrous speed
    if (closestDist < TOO_CLOSE)
      return false;

    // Calculate electric force from potential
    netX *= this.charge;
    netY *= this.charge;

    let accelX = netX / this.mass;
    let accelY = netY / this.mass;

    this.velX += accelX * dt;
    this.velY += accelY * dt;
    this.x += this.velX * dt;
    this.y += this.velY * dt;
    
    return true;
  }
  
  draw(g) {
    g.ellipseMode(CENTER);
    g.strokeWeight(METERS_PER_PIXEL);
    g.stroke(0);
    g.fill(255, 255, 0); // Yellow
    g.ellipse(this.x, this.y, 10 * METERS_PER_PIXEL, 10 * METERS_PER_PIXEL);
  }
}

// Gets magnitude of the perpendicular component of B on A
function perpComponent(ax, ay, bx, by) {
  // Find unit vector perpendicular and to the left of A
  let magA = sqrt(ax * ax + ay * ay);
  let perpAX = -ay / magA;
  let perpAY = ax / magA;

  // Dot product of perpendicular vector and B
  // = |P||B|cos(theta), |P| = 1 so this gives |B|cos(theta), which
  // is the perpendicular component
  return perpAX * bx + perpAY * by;
}

class DynamicDipole {
  constructor(x, y, charge1, charge2, mass1, mass2, spacing) {
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.charge1 = charge1;
    this.charge2 = charge2;
    
    this.velX = this.velY = 0;
    this.rotVel = 0;
    
    // Position particles such that center of mass is at the center of rotation
    let c = mass2 * spacing / (mass1 + mass2);
    this.offset1 = -c;
    this.offset2 = spacing - c;
    
    this.mass = mass1 + mass2;
    this.moi = mass1 * this.offset1 * this.offset1 + mass2 * this.offset2 * this.offset2;
  }
  
  getChargeLocations() {
    let sinAngle = sin(this.angle);
    let cosAngle = cos(this.angle);

    let x1 = this.x + this.offset1 * cosAngle;
    let y1 = this.y + this.offset1 * sinAngle;
    let x2 = this.x + this.offset2 * cosAngle;
    let y2 = this.y + this.offset2 * sinAngle;
    
    return [
      {x: x1, y: y1, charge: this.charge1},
      {x: x2, y: y2, charge: this.charge2}
    ];
  }
  
  update(particles, dynamics, dt) {
    let sinAngle = sin(this.angle);
    let cosAngle = cos(this.angle);

    let x1 = this.x + this.offset1 * cosAngle;
    let y1 = this.y + this.offset1 * sinAngle;
    let x2 = this.x + this.offset2 * cosAngle;
    let y2 = this.y + this.offset2 * sinAngle;

    let field1 = getNetElecField(particles, dynamics, x1, y1);
    let field2 = getNetElecField(particles, dynamics, x2, y2);

    if (field1.closestDist < TOO_CLOSE || field2.closestDist < TOO_CLOSE) {
      return false;
    }

    let force1 = {x: field1.x * this.charge1, y: field1.y * this.charge1};
    let force2 = {x: field2.x * this.charge2, y: field2.y * this.charge2};

    let torque1 = perpComponent(x1 - this.x, y1 - this.y, force1.x, force1.y) * abs(this.offset1);
    let torque2 = perpComponent(x2 - this.x, y2 - this.y, force2.x, force2.y) * abs(this.offset2);

    // F = ma => a = F/m
    let accelX = (force1.x + force2.x) / this.mass;
    let accelY = (force1.y + force2.y) / this.mass;

    // T = Ia => a = T/I
    let rotAccel = (torque1 + torque2) / this.moi;

    this.velX += accelX * dt;
    this.velY += accelY * dt;
    this.rotVel += rotAccel * dt;
    this.x += this.velX * dt;
    this.y += this.velY * dt;
    this.angle += this.rotVel * dt;
    
    return true;
  }
  
  draw(g) {
    g.strokeWeight(METERS_PER_PIXEL);
    g.push();
    g.translate(this.x, this.y);
    g.rotate(this.angle);
    g.stroke(0, 64);
    g.line(this.offset1, 0, this.offset2, 0);
    g.stroke(0);
    g.ellipseMode(CENTER);
    g.fill(getColorForCharge(this.charge1));
    g.ellipse(this.offset1, 0, 10 * METERS_PER_PIXEL, 10 * METERS_PER_PIXEL);
    g.fill(getColorForCharge(this.charge2));
    g.ellipse(this.offset2, 0, 10 * METERS_PER_PIXEL, 10 * METERS_PER_PIXEL);
    g.pop();
  }
}

// Whether "interval" is in [before, after]
function crossesMultiple(before, after, interval) {
  let beforePer = before / interval;
  let afterPer = after / interval;

  return floor(beforePer) != floor(afterPer);
}

class FlowLineTracer {
  // Direction should be 1 for tracing away from positive particles,
  // and -1 for tracing away from negative particles
  constructor(x, y, direction) {
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.distSinceArrow = 0;
    this.prevPotential = null;
  }
  
  updateAndDraw(g, particles, arrowSpacing) {
    for (let i = 0; i < TRACER_STEPS_PER_FRAME; i++) {
      let prevX = this.x;
      let prevY = this.y;
      
      // Don't pass dynamics, the flow lines only show static particles
      let {x: netX, y: netY, pot: netPotential} = getNetElecField(particles, [], this.x, this.y);
      
      // Normalize direction
      let netField = sqrt(netX * netX + netY * netY);
      let dirX = netX / netField;
      let dirY = netY / netField;
            
      g.strokeWeight(METERS_PER_PIXEL);
      g.stroke(0);
      
      if (abs(netPotential) < 40 && this.prevPotential != null && crossesMultiple(this.prevPotential, netPotential, arrowSpacing)) {
        // Towards the left of the line
        let normalX = -dirY;
        let normalY = dirX;

        let x = this.x;
        let y = this.y;
        let s = TRACER_ARROW_SIZE * METERS_PER_PIXEL;
        g.line(x, y, x + (normalX - dirX) * s, y + (normalY - dirY) * s);
        g.line(x, y, x + (-normalX - dirX) * s, y + (-normalY - dirY) * s);
      }
      this.prevPotential = netPotential;
      
      // Move slightly in the direction (differential equation approx)
      // Multiply by direction so we step in reverse when tracing away
      // from negative particle
      this.x += dirX * TRACER_STEP_DISTANCE * this.direction;
      this.y += dirY * TRACER_STEP_DISTANCE * this.direction;
      
      g.line(prevX, prevY, this.x, this.y);
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
let arrowSpacing = 5; // volts
let dynamicsInteract = false;

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
  
  let interact = dynamicsInteract ? dynamics : [];
  let dt = 1 / 30.0;
  for (let i = 0; i < DYNAMIC_PARTICLE_SUBSTEPS; i++) {
    for (let j = 0; j < dynamics.length; j++) {
      let keep = dynamics[j].update(particles, interact, dt / DYNAMIC_PARTICLE_SUBSTEPS);
      if (!keep) {
        dynamics.splice(j, 1);
        j--;
      }
    }
  }
  
  dynamicsGraphics.push();
  setUpCoordinates(dynamicsGraphics);
  for (let particle of dynamics) {
    particle.draw(dynamicsGraphics);
  }
  dynamicsGraphics.pop();
  
  image(fieldGraphics, 0, 0);
  image(dynamicsGraphics, 0, 0);
  
  fill(196);
  stroke(0);
  strokeWeight(1);
  rect(0, 0, textWidth("Press I to toggle forces between dynamics") + 10, 250);
  
  fill(0);
  text("Left click to place positive particle", 4, 15);
  text("Right click to place negative particle", 4, 30);
  text("Space to clear screen and particles", 4, 45);
  
  text("Up/down arrows to change line density", 4, 70);
  text("Current density: " + tracersPerParticle + " lines/particle", 4, 85);
  
  text("Press A to toggle arrows", 4, 110);
  text("Arrows are: " + (arrowsEnabled ? "ON" : "OFF"), 4, 125);
  text("Left/right arrows to change arrow spacing", 4, 140);
  text("Current arrow spacing: " + arrowSpacing + " volts/arrow", 4, 155);
  
  text("Press P to place dynamic (+) particle", 4, 180);
  text("Press D to place dynamic dipole", 4, 195);
  text("Press C to remove all dynamic particles", 4, 210);
  text("Press I to toggle forces between dynamics", 4, 225);
  text("Dynamic interactions are " + (dynamicsInteract ? "ON" : "OFF"), 4, 240);
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

  fieldGraphics.remove();
  dynamicsGraphics.remove();
  
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
  } else if (key == 'i') {
    dynamicsInteract = !dynamicsInteract;
  } else if (key == 'p') {
    let {x, y} = getMousePosition();
    dynamics.push(new DynamicParticle(x, y, DYNAMIC_PARTICLE_CHARGE, DYNAMIC_PARTICLE_MASS));
  } else if (key == 'd') {
    let {x, y} = getMousePosition();
    dynamics.push(new DynamicDipole(
      x, y,
      DYNAMIC_PARTICLE_CHARGE, -DYNAMIC_PARTICLE_CHARGE,
      DYNAMIC_PARTICLE_MASS, DYNAMIC_PARTICLE_MASS,
      DYNAMIC_DIPOLE_SPACING
    ));
  } else if (key == 'c') {
    clearDynamicsGraphics();
    dynamics = [];
  } else if (key == 'ArrowRight' && arrowSpacing < 9.9) {
    arrowSpacing += 1;
    if (arrowsEnabled)
      clearField();
  } else if (key == 'ArrowLeft' && arrowSpacing > 1.1) {
    arrowSpacing -= 1;
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
