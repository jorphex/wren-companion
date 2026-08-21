class LatestOperation {
  constructor() {
    this.generation = 0
    this.active = undefined
  }

  invalidate() {
    this.generation += 1
    this.active = undefined
  }

  isActive() {
    return this.active?.generation === this.generation
  }

  run(task, onSuccess, onFailure) {
    if (this.active?.generation === this.generation) return this.active.promise

    const generation = this.generation
    const operation = { generation }
    operation.promise = Promise.resolve()
      .then(task)
      .then((value) => {
        if (generation === this.generation) return onSuccess(value)
      })
      .catch((error) => {
        if (generation === this.generation) return onFailure(error)
      })
      .finally(() => {
        if (this.active === operation) this.active = undefined
      })
    this.active = operation
    return operation.promise
  }
}

module.exports = { LatestOperation }
