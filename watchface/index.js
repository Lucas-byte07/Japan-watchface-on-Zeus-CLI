import { createWidget, widget, align, prop, text_style, anim_status, events, data_type, show_level } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { Time, Calorie, Battery, Weather, Barometer, Distance, HeartRate } from '@zos/sensor'
import { openApplication } from '@zos/app'

const FONT_PATH = 'font/arial_watchface.ttf'
const CAL_ICON_PREFIX = 'cal/kcal_'
const BAT_ICON_PREFIX = 'bat/bat_'
const WEATHER_ICON_PREFIX = 'clima/clima_'

// ==========================================================================
// AoD (Always On Display)
// ==========================================================================
// Zepp OS decides which widget set appears in each screen state via the
// "show_level" property passed at widget CREATION time (createWidget) —
// it cannot be changed later with setProperty. So:
//  - every NORMAL (color UI) widget gets show_level: NORMAL_ONLY, so it
//    disappears when the screen enters AoD;
//  - the AoD-only widgets (aod.png background, white hour/minute text,
//    white calorie/battery icons) get show_level: AOD_ONLY.
// NOTE: "AOD_ONLY" maps to show_level.ONLY_AOD in the Zepp OS API. Some
// docs typo this constant name — if the simulator throws
// "ONLY_AOD is undefined", check node_modules/@zeppos/device-types.
const NORMAL_ONLY = show_level.ONLY_NORMAL
const AOD_ONLY = show_level.ONLY_AOD

const CAL_AOD_ICON_PREFIX = 'cal_aod/kcal_'
const BAT_AOD_ICON_PREFIX = 'bat_aod/bat_'
const WEATHER_AOD_ICON_PREFIX = 'clima_aod/clima_'

function pad2(n) {
  return n.toString().padStart(2, '0')
}

function percentToLevel(percent) {
  return Math.max(0, Math.min(10, Math.round(percent / 10)))
}

function getCalorieLevel(current, target) {
  if (!target || target <= 0) return 0
  return percentToLevel((current / target) * 100)
}

Page({
  state: {
    animationWidget: null,
    time: null,
    hourText: null,
    minuteText: null,
    secondText: null,
    lastHour: null,
    lastMinute: null,
    calorie: null,
    calorieIconWidget: null,
    calorieText: null,
    battery: null,
    batteryIconWidget: null,
    batteryText: null,
    // --- AoD-only widgets (same positions as above, show_level: AOD_ONLY) ---
    aodHourText: null,
    aodMinuteText: null,
    aodCalorieIconWidget: null,
    aodCalorieText: null,
    aodBatteryIconWidget: null,
    aodBatteryText: null,
    aodWeatherIconWidget: null,
    calorieChangeCallback: null,
    batteryChangeCallback: null,
    alertWidgets: null,      // { battery, uvi, bpm, biocharge } -> widget IMG
    alertActive: null,       // { battery, uvi, bpm, biocharge } -> boolean
    alertBlinkIntervalId: null,
    alertBlinkVisible: false,
    shortcutWidgets: null,   // { strengthTraining, outdoorCycling, ... } -> widget IMG_CLICK
    uviArcWidget: null,
    humidityArcWidget: null,
    weather: null,
    barometer: null,
    tickIntervalId: null,
    tickCount: 0,
    distance: null,
    distanceText: null,
    dateText: null,
    dayOfWeekText: null,
    heartRate: null,
    heartRateChangeCallback: null,
    bpmText: null,
    bpmBar: null,
    maxBpm: 200,           
    updateFrequency: 1
  },

  onInit() {
    console.log('onInit called')
    
  },

  build() {
    console.log('build called')
    const { width, height } = getDeviceInfo()
    
    // 1) Background animation — 118 frames at 12 fps
    const animationWidget = createWidget(widget.IMG_ANIM, {
      show_level: NORMAL_ONLY,
      x: 35,
      y: 123,
      w: width,
      h: height,
      anim_path: 'animation',        // folder: assets/<device>/animation
      anim_prefix: 'frame',          // files: frame_<n>.png
      anim_ext: 'png',
      anim_fps: 12,                  // 12 fps ≈ 83 ms per frame
      anim_size: 118,                // total frame count
      repeat_count: 0,                // 0 = loop forever
      anim_status: anim_status.START,
    })
    animationWidget.setProperty(prop.ANIM_STATUS, anim_status.START)
    this.state.animationWidget = animationWidget
    // 2) Background image — layered over the animation to hide frame edges
    createWidget(widget.IMG, {
      show_level: NORMAL_ONLY,
      x: 0,
      y: 0,
      w: width,
      h: height,
      src: 'bg.png',
    })

    // 3) Clock — hour, minute and second text
    const time = new Time()
    this.state.time = time

    const HM_TEXT_SIZE = 52
    const HM_WIDTH = width
    const HM_HEIGHT = 70

    const SEC_TEXT_SIZE = 16
    const SEC_WIDTH = 100
    const SEC_HEIGHT = 53
    const SEC_X = 195
    const SEC_Y = 353

    this.state.hourText = createWidget(widget.TEXT, {
      show_level: NORMAL_ONLY,
      x: -40,
      y: 358,
      w: HM_WIDTH,
      h: HM_HEIGHT,
      color: 0xff003d,
      text_size: HM_TEXT_SIZE,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      font: FONT_PATH,
      text: pad2(time.getHours()),
    })

    this.state.minuteText = createWidget(widget.TEXT, {
      show_level: NORMAL_ONLY,
      x: 44,
      y: 358,
      w: HM_WIDTH,
      h: HM_HEIGHT,
      color: 0xffffff,
      text_size: HM_TEXT_SIZE,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      font: FONT_PATH,
      text: pad2(time.getMinutes()),
    })

    this.state.secondText = createWidget(widget.TEXT, {
      show_level: NORMAL_ONLY,
      x: SEC_X,
      y: SEC_Y,
      w: SEC_WIDTH,
      h: SEC_HEIGHT,
      color: 0xf1829b,
      text_size: SEC_TEXT_SIZE,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      font: FONT_PATH,
      text: pad2(time.getSeconds()),
    })

    this.state.lastHour = pad2(time.getHours())
    this.state.lastMinute = pad2(time.getMinutes())

    const updateHourMinute = () => {
      const newHour = pad2(this.state.time.getHours())
      if (newHour !== this.state.lastHour) {
        this.state.hourText.setProperty(prop.TEXT, newHour)
        if (this.state.aodHourText) this.state.aodHourText.setProperty(prop.TEXT, newHour)
        this.state.lastHour = newHour
      }
      const newMinute = pad2(this.state.time.getMinutes())
      if (newMinute !== this.state.lastMinute) {
        this.state.minuteText.setProperty(prop.TEXT, newMinute)
        if (this.state.aodMinuteText) this.state.aodMinuteText.setProperty(prop.TEXT, newMinute)
        this.state.lastMinute = newMinute
      }
    }

    time.onPerMinute(updateHourMinute)

    // 4) Calories — icon + counter text
    const calorie = new Calorie()
    this.state.calorie = calorie

    const calCurrent = calorie.getCurrent()
    const calTarget = calorie.getTarget()

    this.state.calorieIconWidget = createWidget(widget.IMG, {
      show_level: NORMAL_ONLY,
      x: 0,
      y: 0,
      src: `${CAL_ICON_PREFIX}${getCalorieLevel(calCurrent, calTarget)}.png`,
    })

    const CAL_TEXT_HEIGHT = 30
    const CAL_TEXT_WIDTH = 100
    const CAL_TEXT_X = 67
    const CAL_TEXT_Y = 122

    this.state.calorieText = createWidget(widget.TEXT, {
      show_level: NORMAL_ONLY,
      x: CAL_TEXT_X,
      y: CAL_TEXT_Y,
      w: CAL_TEXT_WIDTH,
      h: CAL_TEXT_HEIGHT,
      color: 0xffffff,
      text_size: CAL_TEXT_HEIGHT,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      font: FONT_PATH,
      text: calCurrent.toString(),
    })

    const updateCalorie = () => {
      const current = this.state.calorie.getCurrent()
      const target = this.state.calorie.getTarget()
      this.state.calorieIconWidget.setProperty(prop.MORE, {
        src: `${CAL_ICON_PREFIX}${getCalorieLevel(current, target)}.png`,
      })
      this.state.calorieText.setProperty(prop.TEXT, current.toString())
      if (this.state.aodCalorieIconWidget) {
        this.state.aodCalorieIconWidget.setProperty(prop.MORE, {
          src: `${CAL_AOD_ICON_PREFIX}${getCalorieLevel(current, target)}.png`,
        })
        this.state.aodCalorieText.setProperty(prop.TEXT, current.toString())
      }
    }

    this.state.calorieChangeCallback = updateCalorie
    calorie.onChange(this.state.calorieChangeCallback)

    // 5) Battery — icon + percentage text
    const battery = new Battery()
    this.state.battery = battery

    const batCurrent = battery.getCurrent()

    const BAT_ICON_X = 350
    const BAT_ICON_Y = 0

    this.state.batteryIconWidget = createWidget(widget.IMG, {
      show_level: NORMAL_ONLY,
      x: BAT_ICON_X,
      y: BAT_ICON_Y,
      src: `${BAT_ICON_PREFIX}${percentToLevel(batCurrent)}.png`,
    })

    const BAT_TEXT_HEIGHT = 30
    const BAT_TEXT_WIDTH = 100
    const BAT_TEXT_X = 315
    const BAT_TEXT_Y = CAL_TEXT_Y

    this.state.batteryText = createWidget(widget.TEXT, {
      show_level: NORMAL_ONLY,
      x: BAT_TEXT_X,
      y: BAT_TEXT_Y,
      w: BAT_TEXT_WIDTH,
      h: BAT_TEXT_HEIGHT,
      color: 0xff003d,
      text_size: BAT_TEXT_HEIGHT,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      font: FONT_PATH,
      text: `${batCurrent}%`,
    })

    // Low-battery alert handling now lives in the centralized Alert
    // System (section 20); this just refreshes the icon/text on change.
    const updateBattery = () => {
      const current = this.state.battery.getCurrent()
      this.state.batteryIconWidget.setProperty(prop.MORE, {
        src: `${BAT_ICON_PREFIX}${percentToLevel(current)}.png`,
      })
      this.state.batteryText.setProperty(prop.TEXT, `${current}%`)
      if (this.state.aodBatteryIconWidget) {
        this.state.aodBatteryIconWidget.setProperty(prop.MORE, {
          src: `${BAT_AOD_ICON_PREFIX}${percentToLevel(current)}.png`,
        })
        this.state.aodBatteryText.setProperty(prop.TEXT, `${current}%`)
      }
      setAlertState('battery', current < BATTERY_ALERT_THRESHOLD)
    }

    this.state.batteryChangeCallback = updateBattery
    battery.onChange(this.state.batteryChangeCallback)

    // ========================================================================
    // 6) AoD (Always On Display) widgets — background, clock, calorie and
    // battery. Hidden in the normal UI, shown only when show_level is
    // AOD_ONLY. Same coordinates as their NORMAL counterparts (2-5).
    // ========================================================================

    // 6a) AoD background — should be mostly black per Zepp's AoD spec
    // (few lit pixels, no color).
    createWidget(widget.IMG, {
      show_level: AOD_ONLY,
      x: 0,
      y: 0,
      w: width,
      h: height,
      src: 'aod.png',
    })

    // 6b) AoD hour/minute.
    this.state.aodHourText = createWidget(widget.TEXT, {
      show_level: AOD_ONLY,
      x: -40,
      y: 358,
      w: HM_WIDTH,
      h: HM_HEIGHT,
      color: 0xffffff,
      text_size: HM_TEXT_SIZE,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      font: FONT_PATH,
      text: pad2(time.getHours()),
    })

    this.state.aodMinuteText = createWidget(widget.TEXT, {
      show_level: AOD_ONLY,
      x: 44,
      y: 358,
      w: HM_WIDTH,
      h: HM_HEIGHT,
      color: 0xffffff,
      text_size: HM_TEXT_SIZE,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      font: FONT_PATH,
      text: pad2(time.getMinutes()),
    })

    // 6c) AoD calorie icon/text — same layout as the normal widget,
    this.state.aodCalorieIconWidget = createWidget(widget.IMG, {
      show_level: AOD_ONLY,
      x: 0,
      y: 0,
      src: `${CAL_AOD_ICON_PREFIX}${getCalorieLevel(calCurrent, calTarget)}.png`,
    })

    this.state.aodCalorieText = createWidget(widget.TEXT, {
      show_level: AOD_ONLY,
      x: CAL_TEXT_X,
      y: CAL_TEXT_Y,
      w: CAL_TEXT_WIDTH,
      h: CAL_TEXT_HEIGHT,
      color: 0xffffff,
      text_size: CAL_TEXT_HEIGHT,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      font: FONT_PATH,
      text: calCurrent.toString(),
    })

    // 6d) AoD battery icon/text — same layout as the normal widget,
    this.state.aodBatteryIconWidget = createWidget(widget.IMG, {
      show_level: AOD_ONLY,
      x: BAT_ICON_X,
      y: BAT_ICON_Y,
      src: `${BAT_AOD_ICON_PREFIX}${percentToLevel(batCurrent)}.png`,
    })

    this.state.aodBatteryText = createWidget(widget.TEXT, {
      show_level: AOD_ONLY,
      x: BAT_TEXT_X,
      y: BAT_TEXT_Y,
      w: BAT_TEXT_WIDTH,
      h: BAT_TEXT_HEIGHT,
      color: 0xffffff,
      text_size: BAT_TEXT_HEIGHT,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      font: FONT_PATH,
      text: `${batCurrent}%`,
    })

    // ====================================================================
    // Weather
    // ====================================================================
    // getForecast() only returns { cityName, forecastData: { data:
    // [{ index, high, low }], count }, tideData } — no current temp, UVI,
    // humidity or wind. Those must be bound directly to a system
    // data_type on the widget (below), which the firmware keeps updated.
    this.state.weather = new Weather()

    const getWeatherData = () => {
      let city = '---', weatherCode = 0, tempMax = '--', tempMin = '--'
      try {
        const forecast = this.state.weather.getForecast()
        if (forecast) {
          if (forecast.cityName) city = forecast.cityName
          if (forecast.forecastData && forecast.forecastData.count > 0) {
            const today = forecast.forecastData.data[0]
            weatherCode = today.index ?? 0
            tempMax = today.high ?? '--'
            tempMin = today.low ?? '--'
          }
        }
      } catch (e) {}
      return { city, weatherCode: parseInt(weatherCode) || 0, tempMax, tempMin }
    }
   
    const initial = getWeatherData()

    // 7) UVI level image
    // IMG_LEVEL draws array[level], 1-indexed. When auto-bound via
    // data_type.UVI, the firmware reserves level 0 for "no reading yet"
    // and starts real values at level 1 (real UVI 0 -> level 1). The
    // array below is padded with a placeholder at index 0 so the offset
    // lines up correctly.
    const uviImages = [
      'uvi/uvi_0.png', // index 0 = "no reading yet" placeholder, shouldn't appear normally
      ...Array.from({ length: 11 }, (_, i) => `uvi/uvi_${i}.png`), // indices 1-11 = real UVI 0-10
    ]
    this.state.uviWidget = createWidget(widget.IMG_LEVEL, {
      show_level: NORMAL_ONLY,
      x: 206,
      y: 0, 
      image_array: uviImages,
      image_length: uviImages.length,
      type: data_type.UVI,
    })

    // 8) Humidity level image
    const humImages = [
      'umidade/umi_0.png',
      ...Array.from({ length: 11 }, (_, i) => `umidade/umi_${i}.png`),
    ]
    this.state.humidityWidget = createWidget(widget.IMG_LEVEL, {
      show_level: NORMAL_ONLY,
      x: 217,
      y: 10,
      image_array: humImages,
      image_length: humImages.length,
      type: data_type.HUMIDITY,
    })

    // 9) Overlay image — covers the UVI/humidity widgets; must be
    // created AFTER them since creation order = layer order in Zepp OS.
    createWidget(widget.IMG, { x: 206, y: 0, w: width, h: height, src: 'uviumi.png', show_level: NORMAL_ONLY })

    // 10) Weather condition icon — bound to data_type.WEATHER, uses the corrected "index" field.
    const weatherIconList = Array.from({ length: 29 }, (_, i) => `${WEATHER_ICON_PREFIX}${i}.png`)
    this.state.weatherIconWidget = createWidget(widget.IMG_LEVEL, {
      show_level: NORMAL_ONLY,
      x: 223, y: 16,
      image_array: weatherIconList,
      image_length: 29,
      type: data_type.WEATHER,
    })

    // 10.1) Weather condition icon — AoD version. Same position/size and
    // data_type.WEATHER binding, icons sourced from clima_aod/ instead.
    const weatherAodIconList = Array.from({ length: 29 }, (_, i) => `${WEATHER_AOD_ICON_PREFIX}${i}.png`)
    this.state.aodWeatherIconWidget = createWidget(widget.IMG_LEVEL, {
      show_level: AOD_ONLY,
      x: 223, y: 16,
      image_array: weatherAodIconList,
      image_length: 29,
      type: data_type.WEATHER,
    })
    // 11) City name text
    this.state.cityText = createWidget(widget.TEXT, {
      show_level: NORMAL_ONLY,
      x: 190, y: 88, w: 100, h: 25,
      color: 0xf1829b, text_size: 25,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      text: initial.city,
    })
    // 12) Current temperature — not available from the Weather sensor;
    // TEXT_FONT bound to data_type.WEATHER_CURRENT (system-updated).
    this.state.tempText = createWidget(widget.TEXT_FONT, {
      show_level: NORMAL_ONLY,
      x: 104, y: 32, w: 100, h: 15,
      color: 0xff003d, text_size: 15,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      type: data_type.WEATHER_CURRENT,
    })
    // 12.1) Temperature unit symbol (°)
    this.state.tempUnit = createWidget(widget.TEXT, {
      show_level: NORMAL_ONLY,
      x: 163, y: 32,
      w: 20, h: 15,
      color: 0xff003d,
      text_size: 15,
      align_h: align.LEFT,
      align_v: align.CENTER_V,
      text: '°',
      })
    // 13) Min/max temperature text — from the Weather sensor (high/low),
    // works once the forecastData parsing above is fixed.
    this.state.tempMinMaxText = createWidget(widget.TEXT, {
      show_level: NORMAL_ONLY,
      x: 111, y: 56, w: 150, h: 30,
      color: 0xff003d, text_size: 20,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      text: `${initial.tempMin}°/${initial.tempMax}°`,
    })

    // 14) Wind speed text — not available from the Weather sensor;
    // same pattern as tempText, bound to data_type.WIND.
    this.state.windText = createWidget(widget.TEXT_FONT, {
      show_level: NORMAL_ONLY,
      x: 239, y: 60, w: 100, h: 20,
      color: 0xffffff, text_size: 20,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      type: data_type.WIND,
    })

    // Refreshes city + min/max temp text (current temp & wind update automatically via data_type binding)
    const updateWeatherAndSensors = () => {
      const wData = getWeatherData()
      this.state.cityText.setProperty(prop.TEXT, wData.city)
      this.state.tempMinMaxText.setProperty(prop.TEXT, `${wData.tempMin}°/${wData.tempMax}°`)
    }
    // 15) Barometric pressure text — auto-detects hPa vs Pa
    this.state.barometer = new Barometer()
    
    const getPressureHpa = () => {
      try {
        const pressure = this.state.barometer.getAirPressure()
        if (!pressure) return '--'
        // values above 10000 are assumed to be Pa and converted to hPa
        return pressure > 10000 ? Math.round(pressure / 100) : Math.round(pressure)
      } catch(e) {
        return '--'
      }
    }

    const PRESSURE_TEXT_HEIGHT = 15
    const PRESSURE_TEXT_WIDTH = 100
    const PRESSURE_TEXT_X = 249
    const PRESSURE_TEXT_Y = 30

    this.state.pressureText = createWidget(widget.TEXT, {
      show_level: NORMAL_ONLY,
      x: PRESSURE_TEXT_X,
      y: PRESSURE_TEXT_Y,
      w: PRESSURE_TEXT_WIDTH,
      h: PRESSURE_TEXT_HEIGHT,
      color: 0xffffff,
      text_size: PRESSURE_TEXT_HEIGHT,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      font: FONT_PATH,
      text: `${getPressureHpa()} `, 
    })

    const updatePressure = () => {
      this.state.pressureText.setProperty(prop.TEXT, `${getPressureHpa()} `)
    }
    // 16) Distance traveled text
    const distance = new Distance()
    this.state.distance = distance
    
    const DIST_TEXT_HEIGHT = 20
    const DIST_TEXT_WIDTH = 100
    const DIST_TEXT_X = 190
    const DIST_TEXT_Y = 338

    this.state.distanceText = createWidget(widget.TEXT, {
      show_level: NORMAL_ONLY,
      x: DIST_TEXT_X,
      y: DIST_TEXT_Y,
      w: DIST_TEXT_WIDTH,
      h: DIST_TEXT_HEIGHT,
      color: 0xf1829b,
      text_size: DIST_TEXT_HEIGHT,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      font: FONT_PATH,
      text: `${(distance.getCurrent() / 1000).toFixed(3)}km`,
    })

    const updateDistance = () => {
      const d = this.state.distance.getCurrent()
      this.state.distanceText.setProperty(prop.TEXT, `${(d / 1000).toFixed(3)}km`)
    }
    // 17) Date and day-of-week text
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const now = new Date()

    this.state.dateText = createWidget(widget.TEXT, {
      show_level: NORMAL_ONLY,
      x: 75, y: 367, w: 100, h: 17,
      color: 0xff003d, // same color as the hour text
      text_size: 19,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      text: `${pad2(now.getDate())}${MONTHS[now.getMonth()]}`,
    })

    this.state.dayOfWeekText = createWidget(widget.TEXT, {
      show_level: NORMAL_ONLY,
      x: 305, y: 365, w: 100, h: 30,
      color: 0xffffff, // same color as the minute text
      text_size: 24,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      text: DAYS[now.getDay()],
    })

    const updateDate = () => {
      const d = new Date()
      this.state.dateText.setProperty(prop.TEXT, `${pad2(d.getDate())}${MONTHS[d.getMonth()]}`)
      this.state.dayOfWeekText.setProperty(prop.TEXT, DAYS[d.getDay()])
    }
    // 18) Heart rate (BPM) — text + progress bar
    const heartRate = new HeartRate()
    this.state.heartRate = heartRate

    // uses getLast() for the initial render (last measured value),
    // before continuous monitoring starts.
    this.state.bpmText = createWidget(widget.TEXT, {
      show_level: NORMAL_ONLY,
      x: 218, y: 436, w: 100, h: 30,
      color: 0xffffff, // same color as the minute text
      text_size: 25,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      text: `${heartRate.getLast() || 0}`,
    })

    // BPM progress bar (99x9)
    this.state.bpmBar = createWidget(widget.FILL_RECT, {
      show_level: NORMAL_ONLY,
      x: 191, y: 463, w: 99, h: 9,
      radius: 0,
      color: 0xffffff,
    })

    const updateHeartRate = () => {
      const val = this.state.heartRate.getCurrent()
      this.state.bpmText.setProperty(prop.TEXT, `${val}`)
      
      const maxWidth = 99
      // user's max BPM, from state
      const percent = Math.min(val / this.state.maxBpm, 1)
      this.state.bpmBar.setProperty(prop.W, Math.round(maxWidth * percent))

      // high BPM alert (>= 78% of user's max)
      setAlertState('bpm', val >= this.state.maxBpm * BPM_ALERT_PERCENT)
    } 
    this.state.heartRateChangeCallback = updateHeartRate
    heartRate.onCurrentChange(this.state.heartRateChangeCallback)

    // 18.1) BPM bar background/frame image
    createWidget(widget.IMG, {
      show_level: NORMAL_ONLY,
      x: 279,
      y: 463,
      src: 'contagiros.png',
    })
    // 19) BioCharge text — bound to data_type.BIO_CHARGE
    this.state.biochargeText = createWidget(widget.TEXT_FONT, {
      show_level: NORMAL_ONLY,
      x: 155, y: 433, w: 100, h: 35,
      color: 0xffffff,
      text_size: 28,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      type: data_type.BIO_CHARGE,
    })
    // =====================================================================
    // 20) Alert system (battery / UVI / BPM / BioCharge)
    // =====================================================================
    const ALERT_BLINK_INTERVAL_MS = 500
    const BATTERY_ALERT_THRESHOLD = 15    // % — fires when battery < 15
    const UVI_ALERT_THRESHOLD = 10        // fires when UVI >= 10
    const BPM_ALERT_PERCENT = 0.78        // fires when BPM >= 78% of the user's max
    const BIOCHARGE_ALERT_THRESHOLD = 15  // % — fires when BioCharge <= 15
    const ALERT_IMG_MAIOR = 'alertamaior.png' // used for high UVI and high BPM
    const ALERT_IMG_MENOR = 'alertamenor.png' // used for low BioCharge

    const ALERT_DEFS = {
      battery: { x: 325, y: 92, src: ALERT_IMG_MAIOR },
      uvi: { x: 173, y: 10, src: ALERT_IMG_MAIOR },
      bpm: { x: 303, y: 424, src: ALERT_IMG_MAIOR },
      biocharge: { x: 225, y: 426, src: ALERT_IMG_MENOR },
    }

    this.state.alertWidgets = {}
    this.state.alertActive = {}

    Object.keys(ALERT_DEFS).forEach((key) => {
      const def = ALERT_DEFS[key]
      const alertImg = createWidget(widget.IMG, { x: def.x, y: def.y, src: def.src, show_level: NORMAL_ONLY })
      alertImg.setProperty(prop.VISIBLE, false)
      this.state.alertWidgets[key] = alertImg
      this.state.alertActive[key] = false
    })

    const hasActiveAlert = () =>
      Object.keys(this.state.alertActive).some((key) => this.state.alertActive[key])

    const startAlertBlink = () => {
      if (this.state.alertBlinkIntervalId) return
      this.state.alertBlinkVisible = true
      this.state.alertBlinkIntervalId = setInterval(() => {
        this.state.alertBlinkVisible = !this.state.alertBlinkVisible
        Object.keys(this.state.alertActive).forEach((key) => {
          if (this.state.alertActive[key]) {
            this.state.alertWidgets[key].setProperty(prop.VISIBLE, this.state.alertBlinkVisible)
          }
        })
      }, ALERT_BLINK_INTERVAL_MS)
    }

    const stopAlertBlinkIfIdle = () => {
      if (!hasActiveAlert() && this.state.alertBlinkIntervalId) {
        clearInterval(this.state.alertBlinkIntervalId)
        this.state.alertBlinkIntervalId = null
      }
    }

    const setAlertState = (key, isActive) => {
      if (this.state.alertActive[key] === isActive) return
      this.state.alertActive[key] = isActive
      if (isActive) {
        startAlertBlink()
        this.state.alertWidgets[key].setProperty(prop.VISIBLE, this.state.alertBlinkVisible)
      } else {
        this.state.alertWidgets[key].setProperty(prop.VISIBLE, false)
        stopAlertBlinkIfIdle()
      }
    }

    // --- High UVI ---
    // KNOWN LIMITATION: like Weather, the SDK has no dedicated UVI
    // sensor class — the value only reaches the screen via the
    // IMG_LEVEL's "type: data_type.UVI" binding (section 7), firmware
    // updated with no JS callback. We read the widget's own "level"
    // property back to react to it; not officially documented for
    // "type"-bound widgets, verify on device. Fails silently if
    // getProperty doesn't return a valid number. Offset per section 7:
    // level 0 = no reading, level 1 = UVI 0, ... level 11 = UVI 10.
    const getUviValue = () => {
      try {
        const level = this.state.uviWidget.getProperty(prop.LEVEL)
        if (typeof level !== 'number' || level <= 0) return null
        return level - 1
      } catch (e) {
        return null
      }
    }

    const updateUviAlert = () => {
      const uvi = getUviValue()
      if (uvi === null) return
      setAlertState('uvi', uvi >= UVI_ALERT_THRESHOLD)
    }
    updateUviAlert()

    // --- Low BioCharge ---
    // Same limitation as UVI: no dedicated sensor class, value only
    // reaches the screen via data_type.BIO_CHARGE (section 19). We parse
    // the number back out of the widget's formatted text — not
    // officially documented, verify on device. Fails silently otherwise.
    const getBiochargeValue = () => {
      try {
        const raw = this.state.biochargeText.getProperty(prop.TEXT)
        const match = /\d+/.exec(raw)
        return match ? parseInt(match[0], 10) : null
      } catch (e) {
        return null
      }
    }

    const updateBiochargeAlert = () => {
      const biocharge = getBiochargeValue()
      if (biocharge === null) return
      setAlertState('biocharge', biocharge <= BIOCHARGE_ALERT_THRESHOLD)
    }
    updateBiochargeAlert()

    // --- Initial battery/BPM alert state ---
    // (UVI and BioCharge already checked above; battery and BPM have a
    // real sensor, so they're checked here with the value read in build().)
    setAlertState('battery', batCurrent < BATTERY_ALERT_THRESHOLD)
    setAlertState('bpm', (heartRate.getLast() || 0) >= this.state.maxBpm * BPM_ALERT_PERCENT)

    // =====================================================================
    // 21) Shortcuts
    // =====================================================================
    // IMG_CLICK is Zepp OS's native tap-to-launch widget: give it an
    // area (x, y, w, h) and a data_type, and the firmware opens the
    // matching app on tap — no addEventListener needed. "shortcut.png"
    // is just brief tap feedback, so a transparent image works fine.
    const SHORTCUT_IMG = 'shortcut.png'

    const SHORTCUT_DEFS = {
      // --- Workout/activity shortcuts
      strengthTraining: { x: 214, y: 123, w: 52, h: 47, type: data_type.FREE_TRAINING },
      outdoorCycling: { x: 60, y: 309, w: 52, h: 47, type: data_type.OUTDOOR_CYCLING },
      outdoorRunning: { x: 365, y: 309, w: 52, h: 47, type: data_type.OUTDOOR_RUNNING },

      // --- Native app/screen shortcuts ---
      weather: { x: 167, y: 0, w: 145, h: 113, type: data_type.WEATHER },
      calorie: { x: 61, y: 63, w: 103, h: 94, type: data_type.CAL },
      battery: { x: 315, y: 63, w: 103, h: 94, type: data_type.BATTERY },
      distance: { x: 173, y: 326, w: 133, h: 36, type: data_type.DISTANCE },
      countDown: { x: 145, y: 367, w: 188, h: 47, type: data_type.COUNT_DOWN },
      bpm: { x: 254, y: 430, w: 82, h: 43, type: data_type.HEART },
      biocharge: { x: 164, y: 430, w: 82, h: 43, type: data_type.BIO_CHARGE },
    }

    this.state.shortcutWidgets = {}
    Object.keys(SHORTCUT_DEFS).forEach((key) => {
      const def = SHORTCUT_DEFS[key]
      this.state.shortcutWidgets[key] = createWidget(widget.IMG_CLICK, {
        show_level: NORMAL_ONLY,
        x: def.x,
        y: def.y,
        w: def.w,
        h: def.h,
        src: SHORTCUT_IMG,
        type: def.type,
      })
    })

    // =====================================================================
    // Master update loop
    // =====================================================================
    const SLOW_POLL_EVERY_N_TICKS = 10 // battery & calories (10s)
    const WEATHER_POLL_EVERY_N_TICKS = 60 // weather (1 min)
    const PRESSURE_POLL_EVERY_N_TICKS = 3600 // barometer (1 hr)
    const ALERT_POLL_EVERY_N_TICKS = 5 // UVI & BioCharge — no change callback (5s)

    this.state.tickIntervalId = setInterval(() => {
      this.state.tickCount++

      // Real-time clock updates (1s)
      this.state.secondText.setProperty(prop.TEXT, pad2(this.state.time.getSeconds()))
      updateHourMinute()

      // ~10s loop
      if (this.state.tickCount % SLOW_POLL_EVERY_N_TICKS === 0) {
        updateCalorie()
        updateBattery()
        updateDistance()
      }

      // 1-minute loop
      if (this.state.tickCount % WEATHER_POLL_EVERY_N_TICKS === 0) {
        updateWeatherAndSensors()
        updateDate()
      }

      // 1-hour loop
      if (this.state.tickCount % PRESSURE_POLL_EVERY_N_TICKS === 0) {
        updatePressure()
      }

      // ~5s loop — UVI and BioCharge have no change event (see
      // section 20), so they're polled instead.
      if (this.state.tickCount % ALERT_POLL_EVERY_N_TICKS === 0) {
        updateUviAlert()
        updateBiochargeAlert()
      }

    }, 1000)
  },

  onDestroy() {
    console.log('onDestroy called')
    
    if (this.state.animationWidget) {
      this.state.animationWidget.setProperty(prop.ANIM_STATUS, anim_status.STOP)
    }
    if (this.state.tickIntervalId) {
      clearInterval(this.state.tickIntervalId)
    }
    if (this.state.alertBlinkIntervalId) {
      clearInterval(this.state.alertBlinkIntervalId)
    }
    if (this.state.calorie && this.state.calorieChangeCallback) {
      this.state.calorie.offChange(this.state.calorieChangeCallback)
    }
    if (this.state.battery && this.state.batteryChangeCallback) {
      this.state.battery.offChange(this.state.batteryChangeCallback)
    }
    if (this.state.heartRate && this.state.heartRateChangeCallback) {
      this.state.heartRate.offCurrentChange(this.state.heartRateChangeCallback)
    }
    this.state.time = null
    this.state.calorie = null
    this.state.battery = null
    this.state.weather = null
    this.state.barometer = null
    this.state.distance = null
    this.state.heartRate = null
    this.state.alertWidgets = null
    this.state.alertActive = null
    this.state.shortcutWidgets = null
  },
})