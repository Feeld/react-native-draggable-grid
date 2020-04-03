/** @format */

import * as React from 'react'
import { Animated, StyleProp, TouchableWithoutFeedback, StyleSheet } from 'react-native'
import { FunctionComponent } from 'react'

interface BlockProps {
  style?: StyleProp<any>
  dragStartAnimationStyle: StyleProp<any>
  onPress?: () => void
  onLongPress: () => void
  onPressOut: () => void
}

export const Block: FunctionComponent<BlockProps> = ({
  style,
  dragStartAnimationStyle,
  onPress,
  onLongPress,
  onPressOut,
  children,
}) => {
  return (
    <Animated.View style={[styles.blockContainer, style, dragStartAnimationStyle]}>
      <TouchableWithoutFeedback onPress={onPress} onLongPress={onLongPress} onPressOut={onPressOut}>
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
