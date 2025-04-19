#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// PCA9685 driver (default I²C address 0x40)
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();

// Number of servos and their PCA9685 channels (0–15)
const uint8_t NUM_SERVOS = 6;
const uint8_t servoChannels[NUM_SERVOS] = { 0, 1, 2, 3, 4, 5 };

// IR sensor pin (shared)
const int irSensorPin = 15;

// Pulse limits for SG90 servos (confirmed working values)
const uint16_t SERVOMIN = 150;   // ~1.0 ms
const uint16_t SERVOMAX = 600;   // ~2.0 ms

// I2C pins
const int I2C_SDA = 21;
const int I2C_SCL = 22;

// Move one servo on `channel` to `angle` (0–180°)
void setServoAngle(uint8_t channel, float angle) {
  angle = constrain(angle, 0, 180);
  uint16_t pulse = map(angle, 0, 180, SERVOMIN, SERVOMAX);
  pwm.setPWM(channel, 0, pulse);
  Serial.print("Moving servo ");
  Serial.print(channel);
  Serial.print(" to angle ");
  Serial.print(angle);
  Serial.print("° (pulse: ");
  Serial.print(pulse);
  Serial.println(")");
}

void scanI2C() {
  byte error, address;
  int nDevices = 0;
  Serial.println("Scanning for I2C devices...");
  for(address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    error = Wire.endTransmission();
    if (error == 0) {
      Serial.print("I2C device found at address 0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
      nDevices++;
    }
  }
  if (nDevices == 0) Serial.println("No I2C devices found!");
}

void setup() {
  Serial.begin(115200);
  while(!Serial) delay(10);  // Wait for Serial to be ready
  
  Serial.println("\nStarting Servo Test...");
  
  // Initialize I2C
  Wire.begin(I2C_SDA, I2C_SCL);
  delay(100);
  
  // Scan for I2C devices
  scanI2C();
  
  // Initialize servo driver
  Serial.println("Initializing PCA9685...");
  if (!pwm.begin()) {
    Serial.println("PCA9685 not found! Check connections");
    while (1);
  }
  Serial.println("PCA9685 found successfully!");
  
  pwm.setOscillatorFrequency(27000000);
  pwm.setPWMFreq(50);  // 50 Hz update rate for servos
  Serial.println("PWM frequency set to 50Hz");
  
  delay(1000);  // Give time for servos to initialize
}

void loop() {
  // Test sequence for servos
  Serial.println("\n=== Moving all servos to 0° ===");
  for (uint8_t i = 0; i < NUM_SERVOS; i++) {
    setServoAngle(servoChannels[i], 0);
    delay(100);  // Small delay between each servo
  }
  delay(2000);  // Hold position
  
  Serial.println("\n=== Moving all servos to 90° ===");
  for (uint8_t i = 0; i < NUM_SERVOS; i++) {
    setServoAngle(servoChannels[i], 75);
    delay(100);
  }
  delay(2000);
  
  Serial.println("\n=== Moving all servos to 180° ===");
  for (uint8_t i = 0; i < NUM_SERVOS; i++) {
    setServoAngle(servoChannels[i], 160);
    delay(100);
  }
  delay(2000);
}
