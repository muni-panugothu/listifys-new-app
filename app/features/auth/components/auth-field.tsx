import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";

import { AuthUI } from "@/constants/auth-ui";
import { ListifyFonts } from "@/constants/typography";

type AuthFieldProps = TextInputProps & {
  label: string;
  isPassword?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
};

export function AuthField({
  label,
  isPassword,
  showPassword,
  onTogglePassword,
  style,
  ...inputProps
}: AuthFieldProps) {
  return (
    <View className="mb-4 w-full">
      <Text
        className="mb-2 text-[14px] text-[#111111]"
        style={{ fontFamily: ListifyFonts.semiBold }}
      >
        {label}
      </Text>
      <View
        className="w-full flex-row items-center px-4"
        style={{
          backgroundColor: AuthUI.inputBg,
          borderRadius: AuthUI.inputRadius,
          minHeight: 52,
        }}
      >
        <TextInput
          {...inputProps}
          placeholderTextColor={AuthUI.muted}
          secureTextEntry={isPassword ? !showPassword : false}
          style={[
            {
              flex: 1,
              paddingVertical: 14,
              fontSize: 15,
              color: AuthUI.text,
              fontFamily: ListifyFonts.regular,
            },
            style,
          ]}
        />
        {isPassword ? (
          <Pressable onPress={onTogglePassword} hitSlop={8}>
            <MaterialIcons
              name={showPassword ? "visibility" : "visibility-off"}
              size={20}
              color={AuthUI.muted}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
