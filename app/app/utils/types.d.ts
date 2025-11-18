declare global {
  interface ActionContext extends OperationContext {
    setStatus: (msg: string, options?: { transient?: boolean }) => void;
    // Ask for a choice, as through ChooserDialog.
    ask: {
      (title: string, labels: string[], defaultIndex?: number): Promise<number | null>;
      <T>(title: string, labels: string[], defaultIndex: number, values: T[]): Promise<T | null>;
    };
  }

  type UserActionFn = (ctx: ActionContext) => MaybePromise<Command | void>;
}

export {};
