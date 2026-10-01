export class UnknownSessionError extends Error {
  constructor() {
    super('Unknown play session.');
  }
}

export class SessionAlreadyUsedError extends Error {
  constructor() {
    super('This play session has already submitted a score.');
  }
}

export class ImplausibleScoreError extends Error {
  constructor() {
    super('The score is not plausible for the time played.');
  }
}
