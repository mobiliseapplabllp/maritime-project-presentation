import { useEffect, useState } from "react";
import { api } from "./api.js";
import { useLang } from "./i18n.jsx";

export function useApi(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const { lang } = useLang();   // re-fetch when the UI language changes so server-localised content follows
  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    api.get(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [path, lang]);
  return { data, error, loading: !data && !error };
}
