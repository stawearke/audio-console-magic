// OBS's own menus (File, Edit, Profile, Scene Collection, Tools, Help), offered by the app so MK can show
// them as its own System page. Only exists inside MK VISION Studio.
import { nativeCall } from "./native";

export interface MenuItem {
  path?: string;
  text?: string;
  enabled?: boolean;
  checked?: boolean;
  shortcut?: string;
  separator?: boolean;
  children?: MenuItem[];
}

export interface SystemMenu {
  title: string;
  items: MenuItem[];
}

export const loadMenus = () => nativeCall<{ menus: SystemMenu[]; classic: boolean }>("menus");

export const triggerMenu = (path: string) => nativeCall<{ ok: boolean }>("menu-trigger", { path });

export const setLayout = (mode: "mk" | "classic") =>
  nativeCall<{ ok: boolean }>("layout", { mode });
