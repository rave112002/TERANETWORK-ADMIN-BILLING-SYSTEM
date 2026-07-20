import { NavLink } from "react-router";

export const buildMenuItems = (items) => {
  return items.reduce((acc, item) => {
    if (item.isShow === false) return acc;

    const menuItem = {
      key: item.value,
      icon: item.icon,
      label: item.link ? (
        <NavLink
          to={item.link}
          className={({ isActive }) =>
            `${
              isActive ? "font-bold" : "font-normal"
            } text-base hover:text-[#60a5fa] hover:font-bold`
          }
        >
          {item.label}
        </NavLink>
      ) : (
        item.label
      ),
    };

    if (item.children?.length) {
      const children = buildMenuItems(item.children);
      if (children.length) menuItem.children = children;
    }

    acc.push(menuItem);
    return acc;
  }, []);
};
