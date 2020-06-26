import { Button } from '@blueprintjs/core'
import { NLUApi } from 'api'
import { props } from 'bluebird'
import { lang } from 'botpress/shared'
import React, { FC, useEffect, useState } from 'react'

import { AutoTrainObserver } from './AutoTrainToggle'

const TrainNow: FC<{ api: NLUApi; eventBus: any; observer: AutoTrainObserver }> = ({ api, eventBus, observer }) => {
  const [loading, setLoading] = useState(true)
  const [training, setTraining] = useState(false)
  const [forcing, setForcing] = useState(false)

  useEffect(() => {
    const fetchIsTraining = async () => {
      setLoading(true)
      const isTraining = await api.isTraining()
      setTraining(isTraining)
      setLoading(false)
    }

    // tslint:disable-next-line: no-floating-promises
    fetchIsTraining()
  }, [])

  useEffect(() => {
    eventBus.on('statusbar.event', event => {
      if (event.type === 'nlu' && (event.message === 'Training complete' || event.message === 'Training not needed')) {
        setTraining(false)
      }
    })

    observer.listeners.push((status: boolean) => {
      setForcing(status)
    })
  }, [])

  const onClick = async () => {
    if (training) {
      await api.cancelTraining()
      setTraining(false)
    } else {
      setTraining(true)
      await api.train()
    }
  }

  const renderTrain = () => {
    return forcing ? lang.tr('module.nlu.retrainAll') : lang.tr('module.nlu.trainNow')
  }

  return (
    <Button loading={loading} onClick={onClick}>
      {training ? lang.tr('module.nlu.cancelTraining') : renderTrain()}
    </Button>
  )
}

export default TrainNow
