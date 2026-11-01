import type { MouseEvent, ReactNode } from "react";
import { useNavigate } from "./routes";

// A real link, so it can be opened in a new tab or copied, that otherwise moves
// between pages without reloading.
function AppLink({
  to,
  resultsPath,
  className,
  label,
  children,
}: {
  to: string;
  resultsPath?: string;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    navigate(to, resultsPath);
  }

  return (
    <a className={className} href={to} aria-label={label} onClick={handleClick}>
      {children}
    </a>
  );
}

export default AppLink;
