// models/Alert.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AlertSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    address: {
      type: String
    }
  },
  stationId: {
    type: String
  },
  stationName: {
    type: String
  },
  aqiValue: {
    type: Number,
    required: true
  },
  aqiCategory: {
    type: String,
    enum: ['Good', 'Moderate', 'Unhealthy for Sensitive Groups', 'Unhealthy', 'Very Unhealthy', 'Hazardous'],
    required: true
  },
  dominantPollutant: {
    type: String,
    enum: ['PM2.5', 'PM10', 'O3', 'NO2', 'SO2', 'CO']
  },
  previousAqiValue: {
    type: Number
  },
  previousAqiCategory: {
    type: String,
    enum: ['Good', 'Moderate', 'Unhealthy for Sensitive Groups', 'Unhealthy', 'Very Unhealthy', 'Hazardous']
  },
  message: {
    type: String,
    required: true
  },
  recommendations: [{
    type: String
  }],
  alertType: {
    type: String,
    enum: ['threshold', 'change', 'forecast'],
    required: true
  },
  status: {
    type: String,
    enum: ['created', 'sent', 'delivered', 'read', 'failed'],
    default: 'created'
  },
  deliveryMethods: {
    push: {
      sent: {
        type: Boolean,
        default: false
      },
      timestamp: {
        type: Date
      }
    },
    email: {
      sent: {
        type: Boolean,
        default: false
      },
      timestamp: {
        type: Date
      }
    },
    sms: {
      sent: {
        type: Boolean,
        default: false
      },
      timestamp: {
        type: Date
      }
    }
  },
  read: {
    type: Boolean,
    default: false
  },
  readTimestamp: {
    type: Date
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  }
});

// Create indexes
AlertSchema.index({ userId: 1, timestamp: -1 });
AlertSchema.index({ location: '2dsphere' });
AlertSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Alert', AlertSchema);
