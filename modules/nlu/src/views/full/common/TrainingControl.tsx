import React, { FC, useEffect, useState } from 'react'

import { NLUApi } from '../../../api'

import style from './style.scss'
import AutoTrainToggle from './AutoTrainToggle'
import TrainNow from './TrainNow'

const TrainingControl: FC<{ api: NLUApi; eventBus: any }> = ({ api, eventBus }) => {
  const [autoTrain, setAutoTrain] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAutoTrain = async () => {
      setLoading(true)
      const isOn = await api.isAutoTrainOn()
      setAutoTrain(isOn)
      setLoading(false)
    }

    // tslint:disable-next-line: no-floating-promises
    fetchAutoTrain()
  }, [])

  const toggleAutoTrain = async () => {
    const newStatus = !autoTrain
    await api.setAutoTrain(newStatus)
    setAutoTrain(newStatus)
  }

  return (
    <div className={style.trainingControl}>
      <AutoTrainToggle autoTrain={autoTrain} loading={loading} toggleAutoTrain={toggleAutoTrain} />
      <TrainNow api={api} eventBus={eventBus} autoTrain={autoTrain} />
    </div>
  )
}

export default TrainingControl
