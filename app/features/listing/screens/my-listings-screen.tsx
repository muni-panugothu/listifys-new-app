import { MaterialIcons } from "@expo/vector-icons";
import { type Href, useRouter } from "@/lib/safe-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";

import { MyListingManageCard } from "@/components/my-listing-manage-card";
import {
  FILTER_CATEGORY_MAP,
  MY_LISTING_FILTERS,
  MyListingsTabs,
  type MyListingsFilter,
} from "@/components/my-listings-tabs";
import { ProfileSubScreenLayout } from "@/components/profile-sub-screen-layout";
import { type CategorySlug } from "@/constants/categories";
import { ListifyFonts } from "@/constants/typography";
import {
  deleteListing,
  fetchMyListings,
  markListingStatus,
  type ListingItem,
} from "@/features/listing/services/listing-api";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useStaleFocusRefetch } from "@/hooks/use-stale-focus-refetch";
import { formatTimeAgo } from "@/lib/format-time-ago";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const SPECIAL_DETAIL_ROUTES: Record<string, string> = {
  events: "/event-detail",
  properties: "/property-detail",
  jobs: "/job-detail",
  services: "/service-detail",
};

function getCategory(listing: ListingItem): string {
  return (listing as ListingItem & { _source?: string })._source ?? listing.category;
}

function getMarkSoldConfig(category: string): {
  label: string;
  confirmTitle: string;
  confirmMessage: string;
  successMessage: string;
  status: "sold" | "inactive";
} {
  switch (category) {
    case "jobs":
      return {
        label: "Close listing",
        confirmTitle: "Close job listing",
        confirmMessage:
          "Mark this job as closed? It will be hidden from search and related chats become read-only.",
        successMessage: "Job marked as closed",
        status: "sold",
      };
    case "events":
      return {
        label: "Mark as ended",
        confirmTitle: "End event listing",
        confirmMessage:
          "Mark this event as ended? It will no longer appear in feeds and chats become read-only.",
        successMessage: "Event marked as ended",
        status: "sold",
      };
    case "properties":
      return {
        label: "Mark as sold / rented",
        confirmTitle: "Mark property",
        confirmMessage:
          "Mark this property as sold or rented? It will be hidden from listings and chats become read-only.",
        successMessage: "Property marked as sold",
        status: "sold",
      };
    case "services":
      return {
        label: "Mark as inactive",
        confirmTitle: "Deactivate service",
        confirmMessage:
          "Make this service inactive? It will be hidden from search results.",
        successMessage: "Service marked as inactive",
        status: "inactive",
      };
    case "takecare":
      return {
        label: "Mark as inactive",
        confirmTitle: "Deactivate listing",
        confirmMessage:
          "Mark this listing as inactive? It will be hidden from feeds.",
        successMessage: "Listing marked as inactive",
        status: "sold",
      };
    default:
      return {
        label: "Mark as sold",
        confirmTitle: "Mark as sold",
        confirmMessage:
          "Mark this item as sold? It will be removed from listings and related chats become read-only.",
        successMessage: "Marked as sold",
        status: "sold",
      };
  }
}

function getReactivateConfig(category: string): {
  label: string;
  confirmTitle: string;
  confirmMessage: string;
  successMessage: string;
  statusLabel: string;
} {
  switch (category) {
    case "jobs":
      return {
        label: "Reopen listing",
        confirmTitle: "Reopen job listing",
        confirmMessage:
          "Make this job active again? It will appear in search and chats will reopen.",
        successMessage: "Job is active again",
        statusLabel: "Closed",
      };
    case "events":
      return {
        label: "Mark as active",
        confirmTitle: "Reactivate event",
        confirmMessage:
          "Make this event active again? It will show in listings and chats will reopen.",
        successMessage: "Event is active again",
        statusLabel: "Ended",
      };
    case "properties":
      return {
        label: "Mark as available",
        confirmTitle: "Relist property",
        confirmMessage:
          "Make this property available again? It will show in listings and chats will reopen.",
        successMessage: "Property is active again",
        statusLabel: "Sold",
      };
    case "services":
      return {
        label: "Mark as active",
        confirmTitle: "Activate service",
        confirmMessage:
          "Make this service active again? It will appear in search results.",
        successMessage: "Service is active again",
        statusLabel: "Inactive",
      };
    default:
      return {
        label: "Mark as unsold",
        confirmTitle: "Relist item",
        confirmMessage:
          "Make this item available again? It will show in listings and chats will reopen.",
        successMessage: "Listing is active again",
        statusLabel: "Sold",
      };
  }
}

/** User-marked sold/inactive — can be re-listed. */
function isSoldOrInactive(listing: ListingItem): boolean {
  const s = (listing.status || "").toLowerCase();
  return s === "sold" || s === "inactive" || s === "rented";
}

function isActiveListing(listing: ListingItem): boolean {
  const s = (listing.status || "active").toLowerCase();
  return s === "active" || s === "draft" || !listing.status;
}

export function MyListingsScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<MyListingsFilter>("All");
  const [allListings, setAllListings] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadListings = useCallback(async (opts?: { background?: boolean }) => {
    if (!opts?.background) setLoading(true);
    try {
      const res = await fetchMyListings();
      setAllListings(res.listings || []);
    } catch {
      // keep existing on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  const { forceRefetch } = useStaleFocusRefetch(
    () => loadListings({ background: true }),
    { staleMs: 30_000, skipInitialFocus: true },
  );

  const { refreshing, onRefresh } = usePullToRefresh(() => forceRefetch());

  const activeListings = useMemo(
    () => allListings.filter(isActiveListing),
    [allListings],
  );

  const soldListings = useMemo(
    () => allListings.filter(isSoldOrInactive),
    [allListings],
  );

  const counts = useMemo(() => {
    const result = {} as Record<MyListingsFilter, number>;
    result.Sold = soldListings.length;
    for (const filter of MY_LISTING_FILTERS) {
      if (filter === "Sold") continue;
      const cats = FILTER_CATEGORY_MAP[filter];
      if (cats === "all") {
        result[filter] = activeListings.length;
      } else {
        result[filter] = activeListings.filter((l) =>
          cats.includes(getCategory(l)),
        ).length;
      }
    }
    return result;
  }, [activeListings, soldListings]);

  const visibleListings = useMemo(() => {
    if (activeFilter === "Sold") return soldListings;
    const cats = FILTER_CATEGORY_MAP[activeFilter as Exclude<MyListingsFilter, "Sold">];
    if (cats === "all") return activeListings;
    return activeListings.filter((l) => cats.includes(getCategory(l)));
  }, [activeFilter, activeListings, soldListings]);

  const isSoldView = activeFilter === "Sold";

  const openDetail = useCallback(
    (listing: ListingItem) => {
      const cat = getCategory(listing);
      const specialRoute = SPECIAL_DETAIL_ROUTES[cat];
      if (specialRoute) {
        router.push(`${specialRoute}?id=${listing._id}&category=${cat}` as Href);
      } else {
        router.push(`/listing-detail-template?category=${cat}&id=${listing._id}` as Href);
      }
    },
    [router],
  );

  const handleEditListing = useCallback(
    (listing: ListingItem) => {
      const category = getCategory(listing) as CategorySlug;
      router.push(`/edit-listing?category=${category}&id=${listing._id}` as Href);
    },
    [router],
  );

  const handleDeleteListing = useCallback((listing: ListingItem) => {
    const category = getCategory(listing) as CategorySlug;
    Alert.alert(
      "Delete listing",
      `Delete "${listing.title}"? This cannot be undone. Related chats will become read-only.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const snapshot = allListings;
            setActionId(listing._id);

            void (async () => {
              try {
                await deleteListing(category, listing._id);
                setAllListings((prev) => prev.filter((l) => l._id !== listing._id));
                showSuccessToast("Deleted", "Listing removed successfully");
              } catch {
                setAllListings(snapshot);
                showErrorToast(
                  "Error",
                  "Failed to delete listing. Please try again.",
                );
              } finally {
                setActionId(null);
              }
            })();
          },
        },
      ],
    );
  }, [allListings]);

  const handleMarkSold = useCallback((listing: ListingItem) => {
    const category = getCategory(listing) as CategorySlug;
    const cfg = getMarkSoldConfig(category);
    Alert.alert(cfg.confirmTitle, cfg.confirmMessage, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        onPress: () => {
          const snapshot = allListings;
          const newStatus = cfg.status === "inactive" ? "inactive" : "sold";
          setActionId(listing._id);
          setAllListings((prev) =>
            prev.map((l) =>
              l._id === listing._id ? { ...l, status: newStatus } : l,
            ),
          );

          void (async () => {
            try {
              const res = await markListingStatus(
                category,
                listing._id,
                cfg.status,
              );
              const finalStatus = res.listing?.status ?? newStatus;
              setAllListings((prev) =>
                prev.map((l) =>
                  l._id === listing._id ? { ...l, status: finalStatus } : l,
                ),
              );
              showSuccessToast("Success", cfg.successMessage);
            } catch {
              setAllListings(snapshot);
              showErrorToast(
                "Error",
                "Failed to update listing. Please try again.",
              );
            } finally {
              setActionId(null);
            }
          })();
        },
      },
    ]);
  }, [allListings]);

  const handleReactivate = useCallback((listing: ListingItem) => {
    const category = getCategory(listing) as CategorySlug;
    const cfg = getReactivateConfig(category);
    Alert.alert(cfg.confirmTitle, cfg.confirmMessage, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        onPress: () => {
          const snapshot = allListings;
          setActionId(listing._id);
          setAllListings((prev) =>
            prev.map((l) =>
              l._id === listing._id ? { ...l, status: "active" } : l,
            ),
          );

          void (async () => {
            try {
              await markListingStatus(category, listing._id, "active");
              setAllListings((prev) =>
                prev.map((l) =>
                  l._id === listing._id ? { ...l, status: "active" } : l,
                ),
              );
              showSuccessToast("Success", cfg.successMessage);
            } catch {
              setAllListings(snapshot);
              showErrorToast(
                "Error",
                "Failed to reactivate listing. Please try again.",
              );
            } finally {
              setActionId(null);
            }
          })();
        },
      },
    ]);
  }, [allListings]);

  return (
    <ProfileSubScreenLayout
      title="My listings"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={["#27BB97"]}
          tintColor="#27BB97"
        />
      }
    >
      <MyListingsTabs
        activeFilter={activeFilter}
        onFilterPress={setActiveFilter}
        counts={counts}
      />

      {loading && visibleListings.length === 0 ? (
        <View className="items-center py-16">
          <ActivityIndicator size="large" color="#27BB97" />
        </View>
      ) : null}

      {!loading && visibleListings.length === 0 ? (
        <View className="items-center rounded-2xl bg-white px-6 py-14">
          <MaterialIcons
            name={isSoldView ? "history" : "inventory-2"}
            size={48}
            color="#D1D5DB"
          />
          <Text
            className="mt-3 text-[16px] text-[#1A1A1A]"
            style={{ fontFamily: ListifyFonts.semiBold }}
          >
            {isSoldView
              ? "No sold listings"
              : `No ${activeFilter === "All" ? "listings" : activeFilter.toLowerCase()} yet`}
          </Text>
          <Text
            className="mt-1 text-center text-[13px] text-[#9CA3AF]"
            style={{ fontFamily: ListifyFonts.regular }}
          >
            {isSoldView
              ? "Items you mark as sold will appear here"
              : "Post your first item to see it here"}
          </Text>
          {!isSoldView ? (
            <Pressable
              onPress={() => router.push("/sell-entry" as Href)}
              className="mt-5 rounded-full bg-[#27BB97] px-6 py-3"
            >
              <Text
                className="text-[14px] text-white"
                style={{ fontFamily: ListifyFonts.semiBold }}
              >
                Start selling
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {visibleListings.map((listing) => {
        const cat = getCategory(listing);
        const soldCfg = getMarkSoldConfig(cat);
        const reactivateCfg = getReactivateConfig(cat);
        const updatedAt =
          typeof listing.updatedAt === "string"
            ? listing.updatedAt
            : listing.createdAt;
        const isBusy = actionId === listing._id;

        if (isSoldView) {
          return (
            <MyListingManageCard
              key={listing._id}
              listing={listing}
              statusLabel={reactivateCfg.statusLabel}
              statusColor="#6B7280"
              metaLine={`${cat} · ${reactivateCfg.statusLabel} ${formatTimeAgo(updatedAt) ?? "recently"}`}
              dimmed
              onPress={() => openDetail(listing)}
              onReactivate={
                isBusy ? undefined : () => handleReactivate(listing)
              }
              reactivateLabel={reactivateCfg.label}
              onDelete={isBusy ? undefined : () => handleDeleteListing(listing)}
              actionLoading={isBusy}
            />
          );
        }

        return (
          <MyListingManageCard
            key={listing._id}
            listing={listing}
            statusLabel="Active"
            statusColor="#27BB97"
            metaLine={`${cat} · Posted ${formatTimeAgo(listing.createdAt) ?? "recently"}`}
            onPress={() => openDetail(listing)}
            onEdit={() => handleEditListing(listing)}
            onDelete={() => handleDeleteListing(listing)}
            onMarkSold={isBusy ? undefined : () => handleMarkSold(listing)}
            markSoldLabel={soldCfg.label}
            actionLoading={isBusy}
          />
        );
      })}
    </ProfileSubScreenLayout>
  );
}
