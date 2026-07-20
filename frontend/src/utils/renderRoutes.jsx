import { Route } from "react-router";

export const renderRoutes = (items) => {
  return items.flatMap((item) => {
    const routes = [];

    if (item.isShow !== false && item.link && item.element) {
      routes.push(
        <Route key={item.value} path={item.link} element={item.element} />,
      );
    }

    if (item.children?.length) {
      routes.push(...renderRoutes(item.children));
    }

    return routes;
  });
};
