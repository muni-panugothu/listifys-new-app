import { MaterialIcons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { memo } from "react";

import { ListingTimeBadge } from "@/components/listing-time-badge";
import { ListifyFonts } from "@/constants/typography";
import { type ListingItem } from "@/features/listing/services/listing-api";
import { formatPrice } from "@/lib/currency";
import { Image } from "@/lib/nativewind-interop";

type MyListingManageCardProps = {
  listing: ListingItem;
  statusLabel: string;
  statusColor?: string;
  metaLine: string;
  onPress: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMarkSold?: () => void;
  onReactivate?: () => void;
  markSoldLabel?: string;
  reactivateLabel?: string;
  actionLoading?: boolean;
  dimmed?: boolean;
  showActions?: boolean;
};

export const MyListingManageCard = memo(function MyListingManageCard({
  listing,
  statusLabel,
  statusColor = "#27BB97",
  metaLine,
  onPress,
  onEdit,
  onDelete,
  onMarkSold,
  onReactivate,
  markSoldLabel = "Mark sold",
  reactivateLabel = "Relist",
  actionLoading = false,
  dimmed = false,
  showActions = true,
}: MyListingManageCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-4 overflow-hidden rounded-2xl bg-white"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
        opacity: actionLoading ? 0.85 : 1,
      }}
    >
      <View
        className="relative w-full bg-[#F6F7F8]"
        style={{ aspectRatio: 4 / 3 }}
      >
        {listing.images?.[0] ? (
          <Image
            source={listing.images[0]}
            contentFit="contain"
            className="h-full w-full"
            style={dimmed ? { opacity: 0.55 } : undefined}
          />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <MaterialIcons name="image" size={40} color="#D1D5DB" />
          </View>
        )}
        <ListingTimeBadge date={listing.createdAt} style={{ top: 12, left: 12 }} />
        <View
          className="absolute right-3 top-3 rounded-full px-2.5 py-1"
          style={{ backgroundColor: statusColor }}
        >
          <Text
            className="text-[10px] uppercase text-white"
            style={{ fontFamily: ListifyFonts.bold }}
          >
            {statusLabel}
          </Text>
        </View>
        {actionLoading ? (
          <View className="absolute inset-0 items-center justify-center bg-black/25">
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        ) : null}
      </View>

      <View className="p-4">
        <View className="flex-row items-start justify-between gap-3">
          <Text
            className="flex-1 text-[16px] text-[#1A1A1A]"
            style={{ fontFamily: ListifyFonts.semiBold }}
            numberOfLines={2}
          >
            {listing.title}
          </Text>
          <Text
            className="text-[16px] text-[#27BB97]"
            style={{ fontFamily: ListifyFonts.bold }}
          >
            {listing.price != null
              ? formatPrice(listing.price, listing.currency)
              : "On request"}
          </Text>
        </View>
        <Text
          className="mt-1 text-[12px] text-[#9CA3AF]"
          style={{ fontFamily: ListifyFonts.regular }}
        >
          {metaLine}
        </Text>
        <View className="mt-3 flex-row gap-4">
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="visibility" size={16} color="#9CA3AF" />
            <Text
              className="text-[12px] text-[#6B7280]"
              style={{ fontFamily: ListifyFonts.medium }}
            >
              {listing.views ?? 0} views
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="favorite" size={16} color="#9CA3AF" />
            <Text
              className="text-[12px] text-[#6B7280]"
              style={{ fontFamily: ListifyFonts.medium }}
            >
              {listing.savedBy?.length ?? 0} saves
            </Text>
          </View>
        </View>
        {showActions ? (
        <View className="mt-4 gap-2 border-t border-[#F0F0F0] pt-3">
          {onReactivate ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onReactivate();
              }}
              disabled={actionLoading}
              className="flex-row items-center justify-center gap-1.5 rounded-xl bg-[#27BB97] py-2.5"
            >
              <MaterialIcons name="refresh" size={18} color="#FFFFFF" />
              <Text
                className="text-[13px] text-white"
                style={{ fontFamily: ListifyFonts.semiBold }}
              >
                {reactivateLabel}
              </Text>
            </Pressable>
          ) : null}
          {onMarkSold ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onMarkSold();
              }}
              disabled={actionLoading}
              className="flex-row items-center justify-center gap-1.5 rounded-xl bg-[#27BB97] py-2.5"
            >
              <MaterialIcons name="check-circle" size={18} color="#FFFFFF" />
              <Text
                className="text-[13px] text-white"
                style={{ fontFamily: ListifyFonts.semiBold }}
              >
                {markSoldLabel}
              </Text>
            </Pressable>
          ) : null}
          {(onEdit || onDelete) ? (
          <View className="flex-row gap-3">
            {onEdit ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onEdit();
              }}
              disabled={actionLoading}
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-[rgba(39,187,151,0.1)] py-2.5"
            >
              <MaterialIcons name="edit" size={18} color="#27BB97" />
              <Text
                className="text-[13px] text-[#27BB97]"
                style={{ fontFamily: ListifyFonts.semiBold }}
              >
                Edit
              </Text>
            </Pressable>
            ) : null}
            {onDelete ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onDelete();
              }}
              disabled={actionLoading}
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-red-50 py-2.5"
            >
              <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
              <Text
                className="text-[13px] text-red-500"
                style={{ fontFamily: ListifyFonts.semiBold }}
              >
                Delete
              </Text>
            </Pressable>
            ) : null}
          </View>
          ) : null}
        </View>
        ) : null}
      </View>
    </Pressable>
  );
});
