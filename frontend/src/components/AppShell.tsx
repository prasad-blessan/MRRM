import AddBoxOutlined from '@mui/icons-material/AddBoxOutlined'
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import EventAvailableOutlined from '@mui/icons-material/EventAvailableOutlined'
import GpsFixedOutlined from '@mui/icons-material/GpsFixedOutlined'
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined'
import HomeOutlined from '@mui/icons-material/HomeOutlined'
import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import LogoutOutlined from '@mui/icons-material/LogoutOutlined'
import MenuIcon from '@mui/icons-material/Menu'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import { Avatar, ButtonBase, Divider, Drawer, IconButton, ListItemIcon, Menu, MenuItem, Typography } from '@mui/material'
import type { SvgIconComponent } from '@mui/icons-material'
import { useState, type ReactNode } from 'react'
import { NavLink, Link as RouterLink, useLocation } from 'react-router'
import type { UserRole } from '../api/auth'
import { useAuth } from '../auth/context'
import { LevelShiftLogo, MrrmMark } from './BrandLogos'
import { POLICY_LINKS } from './policyLinks'

const ALL: UserRole[] = ['CLIENT_USER', 'LS_ADMIN', 'LS_USER']

// Navigation shows only what the role may use; the server enforces it too.
const NAV: { to: string; label: string; icon: SvgIconComponent; roles: UserRole[] }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: HomeOutlined, roles: ALL },
  { to: '/upload', label: 'Upload & Configure', icon: AddBoxOutlined, roles: ['CLIENT_USER'] },
  { to: '/workflow', label: 'Workflow Monitor', icon: GpsFixedOutlined, roles: ALL },
  { to: '/records', label: 'Records', icon: DescriptionOutlined, roles: ALL },
  { to: '/outputs', label: 'Final Outputs', icon: EventAvailableOutlined, roles: ALL },
  { to: '/admin/registrations', label: 'Registrations', icon: HowToRegOutlined, roles: ['LS_ADMIN'] },
  { to: '/settings', label: 'Settings', icon: SettingsOutlined, roles: ALL },
]

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

function Sidebar({ role, onNavigate }: { role: UserRole; onNavigate?: () => void }) {
  return (
    <div className="shell-sidebar">
      <nav aria-label="Main" className="shell-nav">
        {NAV.filter((item) => item.roles.includes(role)).map(({ to, label, icon: Icon }) => (
          <ButtonBase key={to} component={NavLink} to={to} onClick={onNavigate} className="shell-nav__item">
            <Icon aria-hidden />
            {label}
          </ButtonBase>
        ))}
      </nav>
      <div className="shell-sidebar__foot">
        <Typography className="shell-sidebar__tagline">
          Human in loop AI platform
          <br />
          for Records Review
        </Typography>
        <LevelShiftLogo className="shell-sidebar__logo" />
      </div>
    </div>
  )
}

function UserMenu() {
  const { user, signOut } = useAuth()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  if (!user) return null
  const firstName = user.fullName.split(/\s+/)[0]

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
        className="shell-user-btn"
      >
        <Avatar className="shell-avatar">{initials(user.fullName)}</Avatar>
        <Typography component="span" className="shell-user-name">
          {firstName}
        </Typography>
        <KeyboardArrowDown className="shell-user-caret" />
      </ButtonBase>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} className="shell-menu" anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <div className="shell-user-card">
          <Typography className="shell-user-card__name" noWrap>
            {user.fullName}
          </Typography>
          <Typography variant="body2" color="textSecondary" noWrap>
            {user.organization?.name ?? 'LevelShift'}
          </Typography>
        </div>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null)
            void signOut()
          }}
          className="shell-menu__danger"
        >
          <ListItemIcon>
            <LogoutOutlined fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  )
}

// SEC-06: policy and contact pages stay one click away on every signed-in screen.
function HelpMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <IconButton aria-label="Help, policies and contact" aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget)} className="shell-help-btn">
        <HelpOutlineOutlined />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} className="shell-menu" anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        {POLICY_LINKS.map((link) => (
          <MenuItem key={link.to} component={RouterLink} to={link.to} onClick={() => setAnchor(null)}>
            {link.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

// Layout for signed-in screens: header, left navigation (a drawer below 1200px) and the page.
// Sizes come from the px tokens in styles.css (MRRM prototype design system).
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { pathname } = useLocation()
  const [drawerPath, setDrawerPath] = useState(pathname)
  // Close the drawer after navigation.
  if (drawerPath !== pathname) {
    setDrawerPath(pathname)
    setDrawerOpen(false)
  }
  if (!user) return null

  return (
    <div className="shell">
      <header className="shell-header">
        <IconButton aria-label="Open navigation" onClick={() => setDrawerOpen(true)} className="shell-menu-btn">
          <MenuIcon />
        </IconButton>
        <RouterLink to="/dashboard" aria-label="MRRM home" className="shell-home">
          <MrrmMark className="shell-home__mark" />
          <Typography component="span" className="shell-home__word">
            MRRM
          </Typography>
          <Typography component="span" className="shell-home__sub">
            Medical Records
            <br />
            Review Management
          </Typography>
        </RouterLink>
        <div className="shell-spacer" />
        <HelpMenu />
        <div className="shell-gap" />
        <UserMenu />
      </header>

      <div className="shell-body">
        <div className="shell-aside">
          <Sidebar role={user.role} />
        </div>
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} className="shell-drawer">
          <div className="shell-drawer__content">
            <Sidebar role={user.role} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </Drawer>
        <main className="shell-main">{children}</main>
      </div>
    </div>
  )
}

// Page title and subtitle used by every signed-in screen.
export function PageHeader({ title, subtitle }: { title: string; subtitle: ReactNode }) {
  return (
    <div className="page-header">
      <Typography component="h1" variant="h1" className="page-header__title">
        {title}
      </Typography>
      <Typography className="page-header__subtitle">{subtitle}</Typography>
    </div>
  )
}
