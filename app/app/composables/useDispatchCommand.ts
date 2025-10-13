export function useDispatchCommand() {
  return inject<(cmd: Command) => void>("dispatchCommand")!;
}
