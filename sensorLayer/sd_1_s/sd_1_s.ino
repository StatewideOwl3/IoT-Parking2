#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// PCA9685 driver (default I²C address 0x40)
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();

// Number of servos and their PCA9685 channels (0–15)
const uint8_t NUM_SERVOS = 6;
const uint8_t servoChannels[NUM_SERVOS] = { 0, 1, 2, 3, 4, 5 };

// IR sensor pin (shared)
const int irSensorPin = 15;

// Pulse limits for 0° and 180° (tweak if needed for your SG90s)
const uint16_t SERVOMIN = 150;   // ~1.0 ms
const uint16_t SERVOMAX = 600;   // ~2.0 ms

// Move one servo on `channel` to `angle` (0–180°)
void setServoAngle(uint8_t channel, float angle) {
  angle = constrain(angle, 0, 180);
  uint16_t pulse = SERVOMIN + (angle / 180.0) * (SERVOMAX - SERVOMIN);
  pwm.setPWM(channel, 0, pulse);
}

void setup() {
  Serial.begin(115200);
  while (!Serial);               // Wait for Serial Monitor to open
  Serial.println(F("Enter an angle 0–180°, then press ENTER"));

  Wire.begin();                  // SDA=GPIO21, SCL=GPIO22 by default
  pwm.begin();
  pwm.setPWMFreq(50);            // 50 Hz for servos
  pinMode(irSensorPin, INPUT);
}

void loop() {
  if (Serial.available()) {
    int angle = Serial.parseInt();
    // flush any extra characters
    while (Serial.available()) Serial.read();

    if (angle < 0 || angle > 180) {
      Serial.println(F("⚠️  Invalid—angle must be between 0 and 180."));
      Serial.println(F("Enter an angle 0–180°, then press ENTER"));
      return;
    }

    // Move all 6 servos to the specified angle
    for (uint8_t i = 0; i < NUM_SERVOS; i++) {
      setServoAngle(servoChannels[i], angle);
    }

    delay(500);  // allow servos to reach position

    // Read IR sensor
    int irVal = digitalRead(irSensorPin);
    Serial.print(F("All servos @ "));
    Serial.print(angle);
    Serial.print(F("° → "));
    Serial.println(irVal == LOW ? "Object Detected" : "No Object");
    Serial.println(F("Enter next angle:"));
  }
}
