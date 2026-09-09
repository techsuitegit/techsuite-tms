/** Login backdrop: transport logistics hub with a light theme overlay. */
export function LoginWorldBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-[#0b1220]">
      <img
        src="/login-tms-bg.png?v=2"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-[center_40%]"
      />
      <div className="absolute inset-0 login-theme-overlay" />
      <div className="absolute inset-0 login-theme-glow" />
    </div>
  );
}
