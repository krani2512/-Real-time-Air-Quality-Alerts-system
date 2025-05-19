// models/User.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const LocationSchema = new Schema({
  type: {
    type: String,
    enum: ['home', 'work', 'other'],
    default: 'home'
  },
  name: {
    type: String,
    required: true
  },
  address: {
    type: String
  },
  coordinates: {
    lat: {
      type: Number,
      required: true
    },
    lng: {
      type: Number,
      required: true
    }
  },
  isPrimary: {
    type: Boolean,
    default: false
  }
});

const AlertSettingsSchema = new Schema({
  thresholds: {
    moderate: {
      type: Boolean,
      default: true
    },
    unhealthy: {
      type: Boolean,
      default: true
    },
    veryUnhealthy: {
      type: Boolean,
      default: true
    },
    hazardous: {
      type: Boolean,
      default: true
    }
  },
  notificationMethods: {
    push: {
      type: Boolean,
      default: true
    },
    email: {
      type: Boolean,
      default: true
    },
    sms: {
      type: Boolean,
      default: false
    }
  },
  quietHours: {
    enabled: {
      type: Boolean,
      default: false
    },
    start: {
      type: String,
      default: '22:00'
    },
    end: {
      type: String,
      default: '07:00'
    }
  },
  aqiLevelValues: {
    moderate: {
      type: Number,
      default: 50
    },
    unhealthy: {
      type: Number,
      default: 100
    },
    veryUnhealthy: {
      type: Number,
      default: 150
    },
    hazardous: {
      type: Number,
      default: 300
    }
  }
});

const UserSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String
  },
  accountType: {
    type: String,
    enum: ['local', 'google', 'facebook'],
    default: 'local'
  },
  googleId: {
    type: String
  },
  facebookId: {
    type: String
  },
  avatar: {
    type: String
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String
  },
  resetToken: {
    type: String
  },
  resetTokenExpiry: {
    type: Date
  },
  phone: {
    type: String
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  alertSettings: {
    type: AlertSettingsSchema,
    default: () => ({})
  },
  locations: [LocationSchema],
  deviceTokens: [{
    token: {
      type: String,
      required: true
    },
    platform: {
      type: String,
      enum: ['ios', 'android', 'web'],
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  lastLogin: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
UserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('User', UserSchema);
