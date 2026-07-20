import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

dayjs.locale({
  ...dayjs.Ls.en,
  relativeTime: {
    future: "in %s",
    past: "%s",
    s: "%d sec",
    m: "1 min",
    mm: "%d mins",
    h: "1 hr",
    hh: "%d hrs",
    d: "1 day",
    dd: "%d days",
    M: "1 mo",
    MM: "%d mos",
    y: "1 yr",
    yy: "%d yrs",
  },
});

export const formatDateTimeReadable = (date) => {
  return dayjs(date).format("MMM DD, YYYY - hh:mm A");
};

export const formatDateReadable = (date) => {
  return dayjs(date).format("MMM DD, YYYY");
};

export const formatDateYYYYMMDD = (date) => {
  return dayjs(date).format("YYYY-MM-DD");
};

export const formatExcelDateTime = (date) => {
  return `"${dayjs(date).format("MM/DD/YYYY hh:mm A")}"`;
};

export const formatExcelDate = (date) => {
  return `"${dayjs(date).format("MM/DD/YYYY")}"`;
};

export const formatTime = (time) => {
  return dayjs(time).format("hh:mm ");
};

export const formatRelativeTime = (date) => {
  return dayjs(date).fromNow(); // e.g., "2 hours ago"
};
