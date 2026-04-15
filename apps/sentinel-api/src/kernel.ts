export interface KernelPayload {
  [key: string]: unknown;
}

export class SentinelKernel {
  constructor() {}

  dispatch(command: string, payload?: KernelPayload): void {
    console.log('Executing:', command, payload);
  }
}
