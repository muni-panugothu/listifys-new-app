import React from 'react'
import { Dimensions, useWindowDimensions, View, Text, TouchableOpacity } from 'react-native'
import { Image } from '@/lib/nativewind-interop'
import { LinearGradient } from 'expo-linear-gradient'
import { type Href, useRouter } from '@/lib/safe-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { showErrorToast } from '@/lib/toast'
import { reportGoogleSignInFailure } from '@/lib/auth-error-display'
import { navigateAfterAuthentication } from '@/lib/auth-navigation'
import { authTrace } from '@/lib/auth-trace'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { googleLogin } from '@/store/slices/auth-slice'
import { completeOnboarding } from '@/store/slices/onboarding-slice'
import {
  configureGoogleSignIn,
  signInWithGoogleNative,
} from '@/lib/google-sign-in'

// Import images directly
const bgImage = require('../../../assets/bg.png')
const googleIcon = require('../../../assets/google.jpg')
const mobileIcon = require('../../../assets/mobile.jpg')

/** Full physical screen size — stable in dev + release APK (avoid inset-expanded layout). */
function useFullScreenBackgroundSize() {
  const window = useWindowDimensions()
  const screen = Dimensions.get('screen')
  return {
    width: Math.max(window.width, screen.width),
    height: Math.max(window.height, screen.height),
  }
}

const App = () => {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const bgSize = useFullScreenBackgroundSize()
  const dispatch = useAppDispatch()
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated)
  const sessionHydrated = useAppSelector((s) => s.auth.sessionHydrated)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  const markOnboardingComplete = async () => {
    try {
      await dispatch(completeOnboarding()).unwrap()
    } catch {
      // Ignore storage failures and continue navigation.
    }
  }

  const handleSkip = async () => {
    await markOnboardingComplete()
    router.replace('/(tabs)/home-feed-root' as Href)
  }

  useEffect(() => {
    void configureGoogleSignIn().catch(() => {})
  }, [])

  // Safety net if imperative navigation in handleGoogleSignIn was blocked.
  useEffect(() => {
    if (!sessionHydrated || !isAuthenticated) return
    authTrace('onboarding.effect_nav')
    void (async () => {
      await markOnboardingComplete()
      await navigateAfterAuthentication(router, { source: 'onboarding.effect' })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, sessionHydrated])

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true)
      authTrace('onboarding.google_start')
      const idToken = await signInWithGoogleNative()
      authTrace('onboarding.google_native_ok')
      await dispatch(googleLogin({ idToken })).unwrap()
      authTrace('onboarding.google_backend_ok')
      await markOnboardingComplete()
      await navigateAfterAuthentication(router, { source: 'onboarding.google' })
    } catch (err) {
      reportGoogleSignInFailure(err, showErrorToast, 'Google sign in')
    } finally {
      setIsGoogleLoading(false)
    }
  }

  return (
    <View className="relative flex-1 overflow-hidden bg-[#B5E8D8]">
      <StatusBar style="light" />

      <TouchableOpacity
        className="absolute right-4 z-30 rounded-full bg-black/25 px-4 py-2"
        style={{ top: insets.top + 8 }}
        activeOpacity={0.8}
        onPress={() => {
          void handleSkip()
        }}
      >
        <Text className="font-semibold text-white">Skip</Text>
      </TouchableOpacity>

      <Image
        source={bgImage}
        contentFit="cover"
        contentPosition="center"
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: bgSize.width,
          height: bgSize.height,
        }}
      />

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.88)']}
        locations={[0, 0.45, 1]}
        className="absolute bottom-0 left-0 h-[55%] w-full"
      />

      {/* Bottom Buttons Container */}
      <View
        className="absolute bottom-0 left-0 right-0 z-20 w-full flex-col gap-3 px-4"
        style={{ paddingBottom: Math.max(insets.bottom + 10, 40) }}
      >

        {/* Google Button */}
        <TouchableOpacity
          className="bg-white px-6 py-3 rounded-full flex-row items-center justify-center gap-4"
          activeOpacity={0.8}
          onPress={handleGoogleSignIn}
          disabled={isGoogleLoading}
        >
          <Image
            source={googleIcon}
            style={{ 
              width: 32, 
              height: 32,
              borderRadius: 16,
              backgroundColor: 'white'
            }}
          />
          <Text className="font-semibold text-black">{isGoogleLoading ? 'Connecting...' : 'Continue with Google'}</Text>
        </TouchableOpacity>

        {/* Mobile Button */}
        <TouchableOpacity
          className="bg-white px-6 py-3 rounded-full flex-row items-center justify-center gap-4"
          activeOpacity={0.8}
          onPress={() => {
            void (async () => {
              await markOnboardingComplete()
              router.push('/mobile' as Href)
            })()
          }}
        >
          <Image
            source={mobileIcon}
            style={{ 
              width: 40, 
              height: 32,
              resizeMode: 'contain'
            }}
          />
          <Text className="font-semibold text-black">Continue with Mobile</Text>
        </TouchableOpacity>

        {/* Login Text */}
        <Text className="text-white text-center">
          Already have an account?{' '}
          <Text
            className="text-[14px] font-bold"
            onPress={() => {
              void (async () => {
                await markOnboardingComplete()
                router.replace('/sign-in' as Href)
              })()
            }}
          >
            Login
          </Text>
        </Text>
      </View>
    </View>
  )
}

export { App as OnboardingSlideThreeScreen }
export default App