import { ACCESS_TREE, lowestPlanWith, STAFF_ROLE_KEYS } from "@gym/shared";
import type { AccessFormProps } from "@/components/access-editor";
import type { MessageKey, T } from "./i18n";

/** Labels for the role cards and the access tree, in the UI language. */
export function accessFormText(t: T, submit: string): Pick<AccessFormProps, "roles" | "tree" | "labels"> {
  const plan = (lowestPlanWith("identity.custom_roles") ?? "pro").replace(/^./, (c) => c.toUpperCase());
  return {
    roles: STAFF_ROLE_KEYS.map((r) => ({ key: r, label: t(`acc.role.${r}` as MessageKey), help: t(`acc.roleHelp.${r}` as MessageKey) })),
    tree: ACCESS_TREE.map((a) => ({
      key: a.key,
      label: t(`acc.area.${a.key}` as MessageKey),
      permissions: a.permissions.map((p) => ({ key: p, label: t(`perm.${p}` as MessageKey) })),
    })),
    labels: {
      role: t("users.role"),
      access: t("users.access"),
      accessHelp: t("users.accessHelp"),
      reset: t("acc.reset"),
      custom: t("acc.custom"),
      ownerAll: t("acc.ownerAll"),
      locked: t("acc.locked", { plan }),
      submit,
    },
  };
}

/** Settings tabs (Users & access is its own page, owners only). */
export function settingsTabs(t: T, active: string, canUsers: boolean) {
  const tabs = (["general", "plans", "booking", "website", "holidays"] as const).map((x) => ({
    href: `/settings?tab=${x}`,
    label: t(`set.tab.${x}` as MessageKey),
    active: x === active,
  }));
  if (canUsers) tabs.push({ href: "/settings/users", label: t("set.tab.users"), active: active === "users" });
  return tabs;
}
