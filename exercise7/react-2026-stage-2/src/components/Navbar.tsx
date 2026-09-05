import { NavLink } from 'react-router';

export type NavItem =
  | {
      id: string;
      label: string;
      to: string;
      end?: boolean;
      adminonly?: boolean;
      loggedinonly?: boolean;
      guestonly?: boolean;
    }
  | {
      id: string;
      label: string;
      children: Array<{ id: string; label: string; to: string; end?: boolean }>;
      adminonly?: boolean;
      loggedinonly?: boolean;
      guestonly?: boolean;
    };

export type NavUser = {
  fullname: string;
  admin?: boolean;
  username?: string;
};

function HamburgerMenu() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  );
}

export function Navbar({
  leftHeading,
  navItems,
  user,
  rightSlot,
}: {
  leftHeading: string;
  navItems: NavItem[];
  user: NavUser;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="navbar sticky top-0 z-40 border-b border-base-300 bg-base-100/95 shadow-sm backdrop-blur">
      <div className="navbar-start">
        <div className="dropdown">
          <label
            tabIndex={0}
            className="btn btn-ghost lg:hidden"
            aria-label="Open menu"
          >
            <HamburgerMenu />
          </label>
          <ul
            tabIndex={0}
            className="menu menu-sm dropdown-content z-[1] mt-3 w-56 rounded-box bg-base-100 p-2 shadow"
          >
            <NavItems navItems={navItems} user={user} variant="mobile" />
          </ul>
        </div>
        <div className="px-2 text-lg font-semibold">{leftHeading}</div>
      </div>

      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal px-1">
          <NavItems navItems={navItems} user={user} variant="desktop" />
        </ul>
      </div>

      <div className="navbar-end gap-3">
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium">{user.fullname}</div>
          <div className="text-xs opacity-70">
            {user.username ? (user.admin ? 'Admin' : 'Authenticated') : 'Guest'}
          </div>
        </div>
        {rightSlot}
      </div>
    </div>
  );
}

function NavItems({
  navItems,
  user,
  variant,
}: {
  navItems: NavItem[];
  user: NavUser;
  variant: 'desktop' | 'mobile';
}) {
  const effectiveNavItems = navItems
    .filter((item) => !item.adminonly || user.admin)
    .filter((item) => !item.loggedinonly || user.username)
    .filter((item) => !item.guestonly || !user.username);

  return (
    <>
      {effectiveNavItems.map((item) => {
        if ('to' in item) {
          return (
            <li key={item.id}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? 'active font-medium' : 'font-medium'
                }
              >
                {item.label}
              </NavLink>
            </li>
          );
        }

        if (variant === 'mobile') {
          return (
            <li key={item.id}>
              <details>
                <summary>{item.label}</summary>
                <ul>
                  {item.children.map((child) => (
                    <li key={child.id}>
                      <NavLink to={child.to} end={child.end}>
                        {child.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          );
        }

        return (
          <li key={item.id}>
            <details>
              <summary>{item.label}</summary>
              <ul className="rounded-box bg-base-100 p-2 shadow">
                {item.children.map((child) => (
                  <li key={child.id}>
                    <NavLink to={child.to} end={child.end}>
                      {child.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        );
      })}
    </>
  );
}
