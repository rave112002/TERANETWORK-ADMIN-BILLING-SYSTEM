import { useCallback, useEffect, useState } from "react";

const loadRegions = () => import("../assets/json/regions.json");
const loadProvinces = () => import("../assets/json/provinces.json");
const loadCities = () => import("../assets/json/cities.json");

export const useAddressData = () => {
  const [regionsData, setRegionsData] = useState([]);
  const [provincesData, setProvincesData] = useState([]);
  const [citiesData, setCitiesData] = useState([]);
  const [isLoadingRegions, setIsLoadingRegions] = useState(true);
  const [isLoadingProvinces, setIsLoadingProvinces] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadRegionsData = async () => {
      try {
        const { default: regions } = await loadRegions();
        if (isMounted) {
          setRegionsData(regions || []);
        }
      } catch (error) {
        console.error("Error loading regions:", error);
        if (isMounted) {
          setRegionsData([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingRegions(false);
        }
      }
    };

    loadRegionsData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Load provinces function
  const loadProvincesData = useCallback(async (regionCode) => {
    if (!regionCode) {
      setProvincesData([]);
      return Promise.resolve();
    }

    setIsLoadingProvinces(true);
    try {
      const { default: provinces } = await loadProvinces();
      const filteredProvinces = provinces.filter(
        (province) => province.regCode === regionCode,
      );
      setProvincesData(filteredProvinces || []);
      return Promise.resolve();
    } catch (error) {
      console.error("Error loading provinces:", error);
      setProvincesData([]);
      return Promise.reject(error);
    } finally {
      setIsLoadingProvinces(false);
    }
  }, []);

  // Load cities function
  const loadCitiesData = useCallback(async (provinceCode) => {
    if (!provinceCode) {
      setCitiesData([]);
      return Promise.resolve();
    }

    setIsLoadingCities(true);
    try {
      const { default: cities } = await loadCities();
      const filteredCities = cities.filter(
        (city) => city.provCode === provinceCode,
      );
      setCitiesData(filteredCities || []);
      return Promise.resolve();
    } catch (error) {
      console.error("Error loading cities:", error);
      setCitiesData([]);
      return Promise.reject(error);
    } finally {
      setIsLoadingCities(false);
    }
  }, []);

  return {
    regionsData,
    provincesData,
    citiesData,
    isLoadingRegions,
    isLoadingProvinces,
    isLoadingCities,
    loadProvincesData,
    loadCitiesData,
  };
};
