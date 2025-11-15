export function useDispatchAction() {
  return inject<(actionFn: UserActionFn) => void>("dispatchAction")!;
}
