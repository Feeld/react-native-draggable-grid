/** @format */

import * as React from 'react'
import { Animated, StyleProp, StyleSheet } from 'react-native'
import { FunctionComponent } from 'react'
import { TouchableWithoutFeedback } from 'react-native-gesture-handler'
import { GenericTouchableProps } from 'react-native-gesture-handler/lib/typescript/components/touchables/GenericTouchable'

interface BlockProps
  extends Pick<GenericTouchableProps, 'onPress' | 'onLongPress' | 'onPressOut' | 'delayLongPress'> {
  style?: StyleProp<any>
  dragStartAnimationStyle: StyleProp<any>
  children?: React.ReactNode
}

export const Block: FunctionComponent<BlockProps> = ({
  style,
  dragStartAnimationStyle,
  onPress,
  onLongPress,
  onPressOut,
  children,
  delayLongPress,
}) => {
  return (
    <Animated.View style={[styles.blockContainer, style, dragStartAnimationStyle]}>
      <TouchableWithoutFeedback
        onPress={onPress}
        onLongPress={onLongPress}
        onPressOut={onPressOut}
        delayLongPress={delayLongPress}>
        {children}
      </TouchableWithoutFeedback>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  blockContainer: {
    alignItems: 'center',
  },
})
