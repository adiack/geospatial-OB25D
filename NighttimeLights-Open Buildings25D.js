/**
 * @fileoverview Visualizes urbanization trends by overlaying NOAA Nighttime Lights 
 * with Google Open Buildings temporal data.
 * MIT License 
 */

// =================================================================================
// 1. CONFIGURATION
// =================================================================================

var CONFIG = {
  years: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023],
  
  // Model Parameters
  threshold: 0.34,         // Confidence threshold for building detection
  inflationRadius: 30,     // Buffer radius in meters for visualization
  
  // Visualization Parameters
  vis: {
    lights: {
      min: 0.5,
      max: 60,
      palette: ['black', 'blue', 'purple', 'orange', 'white']
    },
    buildings: {
      min: 0,
      max: 1,
      palette: ['#39FF14'] // Neon Green
    }
  },

  // Export Settings
  export: {
    name: 'Urbanization_Growth',
    fps: 3,                // Playback speed
    scale: 1080            // Video dimension
  }
};

var ASSETS = {
  viirs_v21: "NOAA/VIIRS/DNB/ANNUAL_V21",
  viirs_v22: "NOAA/VIIRS/DNB/ANNUAL_V22",
  buildings: "GOOGLE/Research/open-buildings-temporal/v1"
};

// =================================================================================
// 2. DATA PROCESSING
// =================================================================================

/**
 * Prepares the composite dataset for Nighttime Lights.
 * Handles the version split between V21 (pre-2022) and V22 (2022+).
 * @returns {ee.ImageCollection} Merged collection.
 */
var getLightsCollection = function() {
  var v21 = ee.ImageCollection(ASSETS.viirs_v21).select('average');
  var v22 = ee.ImageCollection(ASSETS.viirs_v22).select('average');
  return v21.merge(v22);
};

/**
 * Generates a single visualization frame for a given year.
 * @param {number} year - The year to visualize.
 * @returns {ee.Image} Blended RGB image.
 */
var createFrame = function(year) {
  // 1. Prepare Data
  var lightsCol = getLightsCollection();
  var buildingsCol = ee.ImageCollection(ASSETS.buildings);
  
  // 2. Resolve Dates
  // Dataset aligns to June 30th of each year for consistency
  var dateStr = ee.String(ee.Number(year).format('%04d')).cat('-06-30');
  var epochSeconds = ee.Date(dateStr, 'America/Los_Angeles').millis().divide(1000);

  // 3. Process Buildings (Filter -> Threshold -> Inflate)
  var buildingMosaic = buildingsCol
    .filter(ee.Filter.eq('inference_time_epoch_s', epochSeconds))
    .mosaic()
    .select('building_presence');

  var buildingMask = buildingMosaic
    .gt(CONFIG.threshold)
    .focal_max({ radius: CONFIG.inflationRadius, kernelType: 'circle', units: 'meters' });

  // 4. Process Lights
  var lightImg = lightsCol
    .filter(ee.Filter.calendarRange(year, year, 'year'))
    .first();

  // 5. Visualize & Blend
  var lightRGB = lightImg.visualize(CONFIG.vis.lights);
  var buildRGB = buildingMask.selfMask().visualize(CONFIG.vis.buildings);

  return lightRGB.blend(buildRGB).set('year', year);
};

// =================================================================================
// 3. EXPORT LOGIC
// =================================================================================

var generateVideoTask = function() {
  var viewport = ee.Geometry(Map.getBounds(true));
  print('Initializing task for ' + CONFIG.years.length + ' years...');

  // Frame sequencing: Repeat frames to control playback speed manually
  var videoFrames = [];
  
  // Growth Loop
  for (var k = 0; k < CONFIG.years.length; k++) {
    var year = CONFIG.years[k];
    var frame = createFrame(year);
    // Push 3x for 1-second duration per year at 3 FPS
    for (var i = 0; i < 3; i++) {
        videoFrames.push(frame);
    }
  }

  // End Freeze (Hold final frame)
  var lastFrame = createFrame(CONFIG.years[CONFIG.years.length - 1]);
  for (var j = 0; j < 4; j++) {
      videoFrames.push(lastFrame);
  }

  // Task Creation
  Export.video.toDrive({
    collection: ee.ImageCollection.fromImages(videoFrames),
    description: CONFIG.export.name,
    dimensions: CONFIG.export.scale,
    framesPerSecond: CONFIG.export.fps,
    region: viewport,
    maxPixels: 1e13
  });

  print('SUCCESS: Export task created.');
};

// =================================================================================
// 4. UI COMPONENT
// =================================================================================

var initUI = function() {
  Map.setOptions('SATELLITE');
  Map.centerObject(ee.Geometry.Point([18.0, 0.0]), 4); // Default view

  var btn = ui.Button({
    label: 'Generate Animation Task',
    style: {position: 'top-center', fontWeight: 'bold', padding: '4px'},
    onClick: generateVideoTask
  });

  var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px 15px'}});
  legend.add(ui.Label('Legend', {fontWeight: 'bold'}));
  legend.add(ui.Label('■ Buildings', {color: CONFIG.vis.buildings.palette[0], margin: '4px 0'}));
  legend.add(ui.Label('■ Night Lights', {color: 'orange', margin: '4px 0'}));

  Map.add(btn);
  Map.add(legend);
  
  // Render Preview
  Map.addLayer(createFrame(2023), {}, 'Preview 2023');
};

// =================================================================================
// 5. EXECUTION
// =================================================================================

initUI();
