export interface NavItem {
  label: string
  href: string
  icon?: string
}
export interface NavGroup {
  label: string
  items: NavItem[]
}
