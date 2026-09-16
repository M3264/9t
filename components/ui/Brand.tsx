export function Brand() {
  return (
    <div className="brand">
      <img src="/9t-mark.svg" alt="9t" />
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="boot">
      <Brand />
      <div className="boot-line">
        <i />
      </div>
      <span>Opening your workspace</span>
    </div>
  );
}
