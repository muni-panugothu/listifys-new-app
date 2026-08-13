import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";

import { ListifyFonts } from "@/constants/typography";
import type { ListingItem } from "@/features/listing/services/listing-api";
import { geocodeSearchQuery } from "@/lib/location-service";
import {
  buildGoogleMapsUrl,
  parseListingCoordinates,
  type LatLng,
} from "@/lib/listing-coordinates";
import { buildMapPreviewUrl } from "@/lib/map-tiles";
import {
  getListingDistanceLabel,
  shouldShowListingDistance,
} from "@/lib/listing-distance";
import { Image } from "@/lib/nativewind-interop";
import { useTheme } from "@/providers/theme-provider";
import { useAppSelector } from "@/store/hooks";
import {
  selectCanShowDistanceOnCards,
  selectIsoCountryCode,
  selectLocationCoords,
} from "@/store/slices/location-slice";

type ListingLocationSectionProps = {
  listing: ListingItem;
  category?: string;
  /** When nested inside a screen that already applies horizontal padding. */
  embedded?: boolean;
};

export function ListingLocationSection({
  listing,
  category,
  embedded = false,
}: ListingLocationSectionProps) {
  const { colors } = useTheme();
  const userCoords = useAppSelector(selectLocationCoords);
  const isoCountryCode = useAppSelector(selectIsoCountryCode);
  const canShowDistance = useAppSelector(selectCanShowDistanceOnCards);
  const categorySlug = category ?? listing.category;
  const showDistance =
    canShowDistance && shouldShowListingDistance(categorySlug);

  const [resolvedCoords, setResolvedCoords] = useState<LatLng | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [mapError, setMapError] = useState(false);

  const listingCoords = useMemo(
    () => parseListingCoordinates(listing),
    [listing],
  );

  const mapCoords = listingCoords ?? resolvedCoords;

  // Reset map error when coordinates change
  useEffect(() => { setMapError(false); }, [listingCoords, resolvedCoords]);

  useEffect(() => {
    if (listingCoords || !listing.location?.trim()) {
      setResolvedCoords(null);
      return;
    }

    let cancelled = false;
    setGeocoding(true);

    void geocodeSearchQuery(listing.location)
      .then((result) => {
        if (!cancelled) {
          setResolvedCoords({ lat: result.lat, lng: result.lng });
        }
      })
      .catch(() => {
        if (!cancelled) setResolvedCoords(null);
      })
      .finally(() => {
        if (!cancelled) setGeocoding(false);
      });

    return () => {
      cancelled = true;
    };
  }, [listing.location, listingCoords]);

  const distanceLabel = showDistance
    ? getListingDistanceLabel(
        {
          _id: listing._id,
          category: categorySlug,
          distance: listing.distance as number | undefined,
          coordinates: listing.coordinates,
          countryCode: listing.countryCode,
          currency: listing.currency,
        },
        userCoords.lat != null && userCoords.lng != null
          ? { lat: userCoords.lat, lng: userCoords.lng }
          : null,
        isoCountryCode,
      )
    : undefined;

  const locationText = listing.location?.trim();
  const googleMapsUrl = buildGoogleMapsUrl(mapCoords, locationText);

  if (!showDistance && !locationText && !mapCoords && !geocoding) {
    return null;
  }

  const openGoogleMaps = () => {
    if (!googleMapsUrl) return;
    void Linking.openURL(googleMapsUrl);
  };

  return (
    <View className={embedded ? "mt-5" : "mt-5 px-4"}>
      <Text
        style={{
          marginBottom: 12,
          fontSize: 16,
          fontFamily: ListifyFonts.bold,
          color: colors.textPrimary,
        }}
      >
        Location
      </Text>

      {(distanceLabel || locationText) ? (
        <View className="mb-3 gap-y-1.5">
          <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
            {distanceLabel ? (
              <View
                className="flex-row items-center gap-1 rounded-full px-3 py-1.5"
                style={{ backgroundColor: colors.primarySoft }}
              >
                <MaterialIcons name="near-me" size={16} color={colors.primary} />
                <Text
                  style={{ fontSize: 14, fontFamily: ListifyFonts.semiBold, color: colors.primaryDeep }}
                >
                  {distanceLabel} away
                </Text>
              </View>
            ) : null}
            {locationText ? (
              <View className="flex-row items-center gap-1 flex-1 min-w-0">
                <MaterialIcons name="location-on" size={16} color={colors.iconMuted} />
                <Text
                  className="flex-1"
                  style={{ fontSize: 14, fontFamily: ListifyFonts.regular, color: colors.textSecondary }}
                  numberOfLines={2}
                >
                  {locationText}
                </Text>
              </View>
            ) : null}
          </View>
          {distanceLabel ? (
            <View className="flex-row items-center gap-1">
              <MaterialIcons name="info-outline" size={11} color={colors.textTertiary} />
              <Text
                style={{ fontSize: 11, fontFamily: ListifyFonts.regular, color: colors.textTertiary }}
              >
                {"Straight-line distance \u00b7 may differ from road distance"}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={openGoogleMaps}
        disabled={!googleMapsUrl}
        className="overflow-hidden rounded-2xl"
        style={({ pressed }) => ({
          opacity: pressed ? 0.92 : 1,
          backgroundColor: colors.surface,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
          elevation: 3,
        })}
      >
        <View
          className="relative h-44 w-full items-center justify-center"
          style={{ backgroundColor: colors.surfaceMuted }}
        >
          {geocoding ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : mapCoords && !mapError ? (
            <Image
              source={buildMapPreviewUrl(mapCoords.lat, mapCoords.lng) ?? ""}
              contentFit="cover"
              onLoad={() => setMapError(false)}
              onError={() => setMapError(true)}
              className="h-full w-full"
            />
          ) : (
            <View className="items-center px-6">
              <MaterialIcons name="map" size={40} color={colors.iconMuted} />
              <Text
                style={{
                  marginTop: 8,
                  textAlign: "center",
                  fontSize: 13,
                  fontFamily: ListifyFonts.regular,
                  color: colors.textSecondary,
                }}
              >
                {locationText ?? "Map unavailable"}
              </Text>
            </View>
          )}

          {googleMapsUrl ? (
            <View
              className="absolute bottom-3 right-3 flex-row items-center gap-1.5 rounded-full px-3 py-2"
              style={{ backgroundColor: colors.surfaceElevated }}
            >
              <MaterialIcons name="map" size={16} color={colors.accentBlue} />
              <Text
                style={{ fontSize: 12, fontFamily: ListifyFonts.semiBold, color: colors.textPrimary }}
              >
                Open in Google Maps
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}
