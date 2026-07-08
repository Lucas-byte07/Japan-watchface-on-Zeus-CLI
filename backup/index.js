import { createWidget, widget, align, prop, text_style, anim_status, events, data_type } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { Time, Calorie, Battery, Weather, Barometer, Distance, HeartRate } from '@zos/sensor'
import { openApplication } from '@zos/app'

const FONT_PATH = 'font/arial_watchface.ttf'
const CAL_ICON_PREFIX = 'cal/kcal_'
const BAT_ICON_PREFIX = 'bat/bat_'
const WEATHER_ICON_PREFIX = 'clima/clima_'

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
    
    //A animação será temporariamente transformada em comentário por razões de otimização do simulador.
    // 1) Animação de fundo — 118 frames a 12 fps
    const animationWidget = createWidget(widget.IMG_ANIM, {
      x: 35,
      y: 123,
      w: width,
      h: height,
      anim_path: 'animation',        // pasta assets/<device>/animation
      anim_prefix: 'frame',          // arquivos frame_<n>.png
      anim_ext: 'png',
      anim_fps: 12,                  // 12 fps ≈ 83 ms por frame
      anim_size: 118,                // total de frames
      repeat_count: 0,                // 0 = repete infinitamente
      anim_status: anim_status.START,
    })
    animationWidget.setProperty(prop.ANIM_STATUS, anim_status.START)
    this.state.animationWidget = animationWidget
    //
    //2) Imagem de fundo, sobreposta a animação para evitar vazamento dos frames
    createWidget(widget.IMG, {
      x: 0,
      y: 0,
      w: width,
      h: height,
      src: 'bg.png',
    })

    // 3) Relógio
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
        this.state.lastHour = newHour
      }
      const newMinute = pad2(this.state.time.getMinutes())
      if (newMinute !== this.state.lastMinute) {
        this.state.minuteText.setProperty(prop.TEXT, newMinute)
        this.state.lastMinute = newMinute
      }
    }

    time.onPerMinute(updateHourMinute)

    // 4) Calorias
    const calorie = new Calorie()
    this.state.calorie = calorie

    const calCurrent = calorie.getCurrent()
    const calTarget = calorie.getTarget()

    this.state.calorieIconWidget = createWidget(widget.IMG, {
      x: 0,
      y: 0,
      src: `${CAL_ICON_PREFIX}${getCalorieLevel(calCurrent, calTarget)}.png`,
    })

    const CAL_TEXT_HEIGHT = 30
    const CAL_TEXT_WIDTH = 100
    const CAL_TEXT_X = 67
    const CAL_TEXT_Y = 122

    this.state.calorieText = createWidget(widget.TEXT, {
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
    }

    this.state.calorieChangeCallback = updateCalorie
    calorie.onChange(this.state.calorieChangeCallback)

    // 5) Bateria
    const battery = new Battery()
    this.state.battery = battery

    const batCurrent = battery.getCurrent()

    const BAT_ICON_X = 350
    const BAT_ICON_Y = 0

    this.state.batteryIconWidget = createWidget(widget.IMG, {
      x: BAT_ICON_X,
      y: BAT_ICON_Y,
      src: `${BAT_ICON_PREFIX}${percentToLevel(batCurrent)}.png`,
    })

    const BAT_TEXT_HEIGHT = 30
    const BAT_TEXT_WIDTH = 100
    const BAT_TEXT_X = 315
    const BAT_TEXT_Y = CAL_TEXT_Y

    this.state.batteryText = createWidget(widget.TEXT, {
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

    // 6) Bateria — a lógica de alerta de bateria baixa foi movida para o
    // Sistema de Alertas centralizado (seção 19, no fim do build()), junto
    // com os novos alertas de UVI, BPM e BioCharge. Aqui ficam só a leitura
    // e a atualização do ícone/texto de bateria. "setAlertState" é definida
    // mais abaixo, mas como só é chamada de dentro deste closure (nunca na
    // hora da criação), o JS já a encontra normalmente quando o callback
    // dispara.
    const updateBattery = () => {
      const current = this.state.battery.getCurrent()
      this.state.batteryIconWidget.setProperty(prop.MORE, {
        src: `${BAT_ICON_PREFIX}${percentToLevel(current)}.png`,
      })
      this.state.batteryText.setProperty(prop.TEXT, `${current}%`)
      setAlertState('battery', current < BATTERY_ALERT_THRESHOLD)
    }

    this.state.batteryChangeCallback = updateBattery
    battery.onChange(this.state.batteryChangeCallback)

    // ====================================================================
    //  Clima
    // ====================================================================
    // IMPORTANTE: o sensor Weather (@zos/sensor) só devolve, via getForecast(),
    // { cityName, forecastData: { data: [{ index, high, low }], count }, tideData }.
    // Ou seja: cidade, código do tempo (index) e máx/mín (high/low) — SÓ ISSO.
    // Não existe (nunca existiu) temperatura atual, UVI, umidade ou vento nesse
    // sensor. Por isso esses 4 campos nunca vão aparecer usando getForecast(),
    // não importa o nome de propriedade usado. A forma oficial de exibi-los em
    // um watchface compilado é vincular o widget diretamente a um data_type do
    // sistema (abaixo), que o próprio relógio mantém atualizado sozinho.
    this.state.weather = new Weather()

    const getWeatherData = () => {
      let city = '---', weatherCode = 0, tempMax = '--', tempMin = '--'
      try {
        const forecast = this.state.weather.getForecast()
        if (forecast) {
          if (forecast.cityName) city = forecast.cityName
          // BUG ORIGINAL: forecastData é um objeto { data, count }, não um array.
          // "forecastData.length" é sempre undefined e "forecastData[0]" também,
          // então esse bloco nunca era executado e tudo ficava no fallback.
          if (forecast.forecastData && forecast.forecastData.count > 0) {
            const today = forecast.forecastData.data[0]
            // BUG ORIGINAL: o campo correto é "index" (0–28), não "weatherCode"/"weather".
            weatherCode = today.index ?? 0
            tempMax = today.high ?? '--'
            tempMin = today.low ?? '--'
          }
        }
      } catch (e) {}
      return { city, weatherCode: parseInt(weatherCode) || 0, tempMax, tempMin }
    }
   
    const initial = getWeatherData()

    // 7) UVI
    // CORREÇÃO: a documentação oficial do IMG_LEVEL diz que "level" desenha
    // a N-ésima imagem do array (contagem a partir de 1, não de 0). Quando o
    // IMG_LEVEL é alimentado automaticamente via "type" (data_type.UVI), o
    // firmware reserva o level 0 para o estado "ainda sem leitura" e só
    // começa a refletir o valor real do sensor a partir do level 1 (UVI
    // real 0 -> level 1 -> 1ª imagem do array). Como o array antigo tinha
    // uvi_0.png logo no índice 0 (a 1ª posição), e não uma imagem-placeholder
    // ali, o level 1 (UVI real = 0) acabava puxando o que estava no índice 1,
    // ou seja, uvi_1.png — exatamente o bug relatado. A correção é "empurrar"
    // o array uma posição, colocando um placeholder no índice 0.
    const uviImages = [
      'uvi/uvi_0.png', // índice 0 = estado "sem leitura ainda" (não deve aparecer em uso normal)
      ...Array.from({ length: 11 }, (_, i) => `uvi/uvi_${i}.png`), // índices 1-11 = UVI real 0-10
    ]
    this.state.uviWidget = createWidget(widget.IMG_LEVEL, {
      x: 206,
      y: 0, 
      image_array: uviImages,
      image_length: uviImages.length,
      type: data_type.UVI,
    })

    // 8) UMIDADE
    // Mesma causa-raiz do UVI acima: o binding automático via "type"
    // (data_type.HUMIDITY) usa o mesmo mecanismo do firmware e por isso
    // também reserva o level 0 para "sem leitura", deslocando os valores
    // reais a partir do level 1. Aplicamos a mesma correção por
    // consistência — teste no simulador/relógio para confirmar, já que
    // esse comportamento do level 0 não é documentado oficialmente pela
    // Zepp, apenas inferido a partir do sintoma que você relatou no UVI.
    const humImages = [
      'umidade/umi_0.png',
      ...Array.from({ length: 11 }, (_, i) => `umidade/umi_${i}.png`),
    ]
    this.state.humidityWidget = createWidget(widget.IMG_LEVEL, {
      x: 217,
      y: 10,
      image_array: humImages,
      image_length: humImages.length,
      type: data_type.HUMIDITY,
    })

    // 9) Imagem isolada — proposital, deve cobrir UVI/umidade e por isso é
    // criada DEPOIS dos ARCs (ordem de criação = ordem de camada no Zepp OS).
    createWidget(widget.IMG, { x: 206, y: 0, w: width, h: height, src: 'uviumi.png' })

    // 10) Weather Imagem — agora usa o "index" correto vindo do sensor
    const weatherIconList = Array.from({ length: 29 }, (_, i) => `${WEATHER_ICON_PREFIX}${i}.png`)
    this.state.weatherIconWidget = createWidget(widget.IMG_LEVEL, {
      x: 223, y: 16,
      image_array: weatherIconList,
      image_length: 29,
      type: data_type.WEATHER,
    })
    // 11) Nome da cidade
    this.state.cityText = createWidget(widget.TEXT, {
      x: 190, y: 88, w: 100, h: 25,
      color: 0xf1829b, text_size: 25,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      text: initial.city,
    })
    //
    // 12) Temperatura atual — não existe no sensor Weather, então usamos o
    // widget nativo TEXT_FONT vinculado a data_type.WEATHER_CURRENT, que o
    // sistema atualiza sozinho (sem precisar de setProperty manual).
    this.state.tempText = createWidget(widget.TEXT_FONT, {
      x: 104, y: 32, w: 100, h: 15,
      color: 0xff003d, text_size: 15,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      type: data_type.WEATHER_CURRENT,
    })
    //12.1)Unidade de temperatura
    this.state.tempUnit = createWidget(widget.TEXT, {
      x: 163, y: 32,
      w: 20, h: 15,
      color: 0xff003d,
      text_size: 15,
      align_h: align.LEFT,
      align_v: align.CENTER_V,
      text: '°',
      })
    // 13) Temperatura mínima / máxima — isso SIM vem do sensor Weather (high/low),
    // e volta a funcionar assim que a leitura de forecastData é corrigida acima.
    this.state.tempMinMaxText = createWidget(widget.TEXT, {
      x: 111, y: 56, w: 150, h: 30,
      color: 0xff003d, text_size: 20,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      text: `${initial.tempMin}°/${initial.tempMax}°`,
    })

    // 14) Força do vento — também não existe no sensor Weather; mesmo esquema
    // do tempText, vinculado a data_type.WIND.
    this.state.windText = createWidget(widget.TEXT_FONT, {
      x: 239, y: 60, w: 100, h: 20,
      color: 0xffffff, text_size: 20,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      type: data_type.WIND,
    })

    // Função de atualização 
    const updateWeatherAndSensors = () => {
      const wData = getWeatherData()
      this.state.cityText.setProperty(prop.TEXT, wData.city)
      this.state.tempMinMaxText.setProperty(prop.TEXT, `${wData.tempMin}°/${wData.tempMax}°`)
    }
    // 15) Barômetro Inteligente (Detecta se já está em hPa ou precisa dividir)
    this.state.barometer = new Barometer()
    
    const getPressureHpa = () => {
      try {
        const pressure = this.state.barometer.getAirPressure()
        if (!pressure) return '--'
        // Se o valor for muito alto (ex: 95000), está em Pa, dividimos por 100.
        // Se já for menor (ex: 950), o relógio já enviou em hPa.
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
    // 16) Distância percorrida
    const distance = new Distance()
    this.state.distance = distance
    
    const DIST_TEXT_HEIGHT = 20
    const DIST_TEXT_WIDTH = 100
    const DIST_TEXT_X = 190
    const DIST_TEXT_Y = 338

    this.state.distanceText = createWidget(widget.TEXT, {
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
    // 17) Data e Dia da Semana
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const now = new Date()

    this.state.dateText = createWidget(widget.TEXT, {
      x: 76, y: 368, w: 100, h: 20,
      color: 0xff003d, // Mesma cor das horas
      text_size: 19,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      text: `${pad2(now.getDate())}${MONTHS[now.getMonth()]}`,
    })

    this.state.dayOfWeekText = createWidget(widget.TEXT, {
      x: 305, y: 365, w: 100, h: 30,
      color: 0xffffff, // Mesma cor dos minutos
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
    // 18) BPM - Frequência Cardíaca
    const heartRate = new HeartRate()
    this.state.heartRate = heartRate

    // Texto do BPM — usamos getLast() para a primeira renderização (último
    // valor já medido pelo relógio), antes de o monitoramento contínuo começar.
    this.state.bpmText = createWidget(widget.TEXT, {
      x: 218, y: 436, w: 100, h: 30,
      color: 0xffffff, // Cor dos minutos
      text_size: 25,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      text: `${heartRate.getLast() || 0}`,
    })

    // Barra de progresso (99x9)
    this.state.bpmBar = createWidget(widget.FILL_RECT, {
      x: 191, y: 463, w: 99, h: 9,
      radius: 0,
      color: 0xffffff,
    })

    const updateHeartRate = () => {
      const val = this.state.heartRate.getCurrent()
      this.state.bpmText.setProperty(prop.TEXT, `${val}`)
      
      const maxWidth = 99
      // Usa a variável personalizada do state
      const percent = Math.min(val / this.state.maxBpm, 1)
      this.state.bpmBar.setProperty(prop.W, Math.round(maxWidth * percent))

      // Alerta de BPM alto (>= 78% do BPM máximo do usuário)
      setAlertState('bpm', val >= this.state.maxBpm * BPM_ALERT_PERCENT)
    } 
    this.state.heartRateChangeCallback = updateHeartRate
    heartRate.onCurrentChange(this.state.heartRateChangeCallback)

    createWidget(widget.IMG, {
      x: 279,
      y: 463,
      src: 'contagiros.png',
    })
    // 10) BioCharge
    this.state.biochargeText = createWidget(widget.TEXT_FONT, {
      x: 155, y: 433, w: 100, h: 35,
      color: 0xffffff,
      text_size: 28,
      align_h: align.CENTER_H, align_v: align.CENTER_V,
      text_style: text_style.NONE, font: FONT_PATH,
      type: data_type.BIO_CHARGE,
    })
    // =====================================================================
    // 19) Sistema de Alertas (versão otimizada)
    // =====================================================================
    // ANTES: só existia o alerta de bateria baixa, com seu próprio widget e
    // seu próprio setInterval de "piscar". Replicar essa receita 4x (bateria
    // + UVI + BPM + BioCharge) rodaria 4 setInterval em paralelo o tempo
    // todo — desperdício de CPU/bateria num relógio.
    //
    // OTIMIZAÇÃO aplicada:
    //  - cada alerta é só um registro { x, y, src } em ALERT_DEFS — para
    //    adicionar um alerta novo no futuro basta uma linha aqui;
    //  - todos os widgets de alerta são criados por um único loop;
    //  - existe UM único setInterval de "piscar" compartilhado por todos os
    //    alertas simultaneamente ativos, e ele só fica rodando enquanto
    //    pelo menos um alerta estiver ativo (para assim que o último some);
    //  - setAlertState(key, bool) é idempotente: chamar de novo com o mesmo
    //    valor não reinicia o piscar nem gera setProperty desnecessário.
    const ALERT_BLINK_INTERVAL_MS = 500
    const BATTERY_ALERT_THRESHOLD = 15    // % — dispara quando bateria < 15
    const UVI_ALERT_THRESHOLD = 10        // dispara quando UVI >= 10
    const BPM_ALERT_PERCENT = 0.78        // dispara quando BPM >= 78% do máximo do usuário
    const BIOCHARGE_ALERT_THRESHOLD = 15  // % — dispara quando BioCharge <= 15
    const ALERT_IMG_MAIOR = 'alertamaior.png' // usada por UVI alto e BPM alto
    const ALERT_IMG_MENOR = 'alertamenor.png' // usada por BioCharge baixa

    const ALERT_DEFS = {
      // Mantido na mesma posição/imagem que já existia neste arquivo, para
      // não mudar o visual atual. Se preferir tratá-lo como um alerta "de
      // baixa" (mesma família do BioCharge), troque src para ALERT_IMG_MENOR.
      battery: { x: 325, y: 92, src: ALERT_IMG_MAIOR },
      uvi: { x: 173, y: 10, src: ALERT_IMG_MAIOR },
      bpm: { x: 303, y: 424, src: ALERT_IMG_MAIOR },
      biocharge: { x: 225, y: 426, src: ALERT_IMG_MENOR },
    }

    this.state.alertWidgets = {}
    this.state.alertActive = {}

    Object.keys(ALERT_DEFS).forEach((key) => {
      const def = ALERT_DEFS[key]
      const alertImg = createWidget(widget.IMG, { x: def.x, y: def.y, src: def.src })
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

    // --- UVI alto ---------------------------------------------------------
    // ATENÇÃO / LIMITAÇÃO CONHECIDA: assim como o Weather (item 11), o SDK
    // não expõe uma classe de sensor dedicada para UVI — o valor só chega à
    // tela pelo binding nativo "type: data_type.UVI" do IMG_LEVEL (item 7),
    // atualizado direto pelo firmware, sem callback de JS. Para reagir a
    // esse valor sem duplicar sensor nenhum, lemos de volta a própria
    // propriedade "level" do widget. Isso NÃO é comportamento oficialmente
    // documentado para widgets alimentados via "type" (só é documentado
    // para quando "level" é setado manualmente) — teste no simulador/no
    // relógio real antes de confiar 100% nele. Se getProperty não retornar
    // um número válido, o alerta simplesmente não dispara (não quebra o
    // resto do watchface). Pelo próprio comentário do item 7 (já testado
    // empiricamente pelo autor original): level 0 = "sem leitura ainda",
    // level 1 = UVI real 0, ..., level 11 = UVI real 10 → UVI real = level - 1.
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

    // --- BioCharge baixa ---------------------------------------------------
    // MESMA LIMITAÇÃO do UVI acima: BioCharge não tem classe de sensor
    // própria em @zos/sensor, só chega à tela via "type: data_type.BIO_CHARGE"
    // no TEXT_FONT (item 10). Tentamos ler de volta o texto já formatado
    // pelo firmware e extrair o número — também não é comportamento
    // oficialmente documentado, valide no simulador/relógio real. Falhando
    // a leitura, o alerta não dispara.
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

    // --- Estado inicial dos alertas de bateria e BPM ------------------------
    // (UVI e BioCharge já foram checados acima; bateria e BPM têm sensor
    // próprio, então são checados aqui com o valor já lido no build().)
    setAlertState('battery', batCurrent < BATTERY_ALERT_THRESHOLD)
    setAlertState('bpm', (heartRate.getLast() || 0) >= this.state.maxBpm * BPM_ALERT_PERCENT)

    // =====================================================================
    // 20) Atalhos (Shortcuts)
    // =====================================================================
    // O Zepp OS já tem um widget nativo feito exatamente para isso: o
    // IMG_CLICK. Você dá a ele uma área (x, y, w, h) e um "type" (do enum
    // data_type), e o PRÓPRIO FIRMWARE cuida de abrir o app correspondente
    // ao toque — não precisamos de addEventListener nem de gambiarra com
    // hmApp.startApp. A imagem "shortcut.png" só aparece como feedback
    // rápido no instante do toque (na prática, fica invisível o resto do
    // tempo), então uma imagem transparente/invisível é exatamente o que
    // esse widget espera.
    const SHORTCUT_IMG = 'shortcut.png'

    const SHORTCUT_DEFS = {
      // --- Atalhos de treino/atividade -------------------------------------
      // ATENÇÃO: o enum data_type só documenta este conjunto fixo de atalhos
      // de atividade: OUTDOOR_RUNNING, WALKING, OUTDOOR_CYCLING,
      // FREE_TRAINING, POOL_SWIMMING, OPEN_WATER_SWIMMING, PHN (Sports
      // Coach) e BREATH_TRAIN. NÃO existe um "STRENGTH_TRAINING" publicamente
      // documentado — usei FREE_TRAINING (Treino Livre) por ser o mais
      // próximo de "treino de força" disponível oficialmente. Teste no
      // simulador/relógio: se o seu firmware não mapear esse atalho para a
      // tela de força, é uma limitação do enum público, não do código.
      strengthTraining: { x: 214, y: 123, w: 52, h: 47, type: data_type.FREE_TRAINING },
      outdoorCycling: { x: 60, y: 309, w: 52, h: 47, type: data_type.OUTDOOR_CYCLING },
      outdoorRunning: { x: 365, y: 309, w: 52, h: 47, type: data_type.OUTDOOR_RUNNING },

      // --- Atalhos para telas/apps nativos ----------------------------------
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
        x: def.x,
        y: def.y,
        w: def.w,
        h: def.h,
        src: SHORTCUT_IMG,
        type: def.type,
      })
    })

    // =====================================================================
    // Loop de Atualização Mestre
    // =====================================================================
    const SLOW_POLL_EVERY_N_TICKS = 10 // Bateria e calorias (10s)
    const WEATHER_POLL_EVERY_N_TICKS = 60 // Clima (1 min)
    const PRESSURE_POLL_EVERY_N_TICKS = 3600 // Barômetro (1 hr)
    const ALERT_POLL_EVERY_N_TICKS = 5 // UVI e BioCharge, que não têm callback de mudança (5s)

    this.state.tickIntervalId = setInterval(() => {
      this.state.tickCount++

      // Atualizações de relógio em tempo real (1s)
      this.state.secondText.setProperty(prop.TEXT, pad2(this.state.time.getSeconds()))
      updateHourMinute()

      // Loop de ~30s
      if (this.state.tickCount % SLOW_POLL_EVERY_N_TICKS === 0) {
        updateCalorie()
        updateBattery()
        updateDistance()
      }

      // Loop de 1 minuto
      if (this.state.tickCount % WEATHER_POLL_EVERY_N_TICKS === 0) {
        updateWeatherAndSensors()
        updateDate()
      }

      // Loop de 1 hora
      if (this.state.tickCount % PRESSURE_POLL_EVERY_N_TICKS === 0) {
        updatePressure()
      }

      // Loop de ~5s — UVI e BioCharge não emitem evento de mudança (ver
      // seção 19), então precisam ser verificados por polling.
      if (this.state.tickCount % ALERT_POLL_EVERY_N_TICKS === 0) {
        updateUviAlert()
        updateBiochargeAlert()
      }

    }, 1000)
  },

  onDestroy() {
    console.log('onDestroy called')
    
    //como não há animação por enquanto, não há necessidade de parar a animação
    if (this.state.animationWidget) {
      this.state.animationWidget.setProperty(prop.ANIM_STATUS, anim_status.STOP)
    }
    //
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