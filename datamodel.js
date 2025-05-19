// models/AirQualityData.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AirQualityDataSchema = new Schema({
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  stationId: {
    type: String,
    required: true
  },
  stationName: {
    type: String,
    required: true
  },
  aqi: {
    type: Number,
    required: true
  },
  category: {
    type: String,
    enum: ['Good', 'Moderate', 'Unhealthy for Sensitive Groups', 'Unhealthy', 'Very Unhealthy', 'Hazardous'],
    required: true
  },
  dominantPollutant: {
    type: String,
    enum: ['PM2.5', 'PM10', 'O3', 'NO2', 'SO2', 'CO'],
    required: true
  },
  pollutants: {
    pm25: {
      concentration: {
        type: Number
      },
      aqi: {
        type: Number
      },
      unit: {
        type: String,
        default: 'μg/m³'
      }
    },
    pm10: {
      concentration: {
        type: Number
      },
      aqi: {
        type: Number
      },
      unit: {
        type: String,
        default: 'μg/m³'
      }
    },
    o3: {
      concentration: {
        type: Number
      },
      aqi: {
        type: Number
      },
      unit: {
        type: String,
        default: 'ppb'
      }
    },
    no2: {
      concentration: {
        type: Number
      },
      aqi: {
        type: Number
      },
      unit: {
        type: String,
        default: 'ppb'
      }
    },
    so2: {
      concentration: {
        type: Number
      },
      aqi: {
        type: Number
      },
      unit: {
        type: String,
        default: 'ppb'
      }
    },
    co: {
      concentration: {
        type: Number
      },
      aqi: {
        type: Number
      },
      unit: {
        type: String,
        default: 'ppm'
      }
    }
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  source: {
    type: String,
    required: true,
    default: 'EPA'
  },
  forecast: [{
    timestamp: {
      type: Date,
      required: true
    },
    aqi: {
      type: Number,
      required: true
    },
    category: {
      type: String,
      enum: ['Good', 'Moderate', 'Unhealthy for Sensitive Groups', 'Unhealthy', 'Very Unhealthy', 'Hazardous'],
      required: true
    }
  }],
  weatherData: {
    temperature: {
      type: Number
    },
    humidity: {
      type: Number
    },
    windSpeed: {
      type: Number
    },
    windDirection: {
      type: Number
    },
    timestamp: {
      type: Date
    }
  }
});

// Create index for geospatial queries
AirQualityDataSchema.index({ location: '2dsphere' });
AirQualityDataSchema.index({ timestamp: -1 });
AirQualityDataSchema.index({ stationId: 1, timestamp: -1 });

module.exports = mongoose.model('AirQualityData', AirQualityDataSchema);
