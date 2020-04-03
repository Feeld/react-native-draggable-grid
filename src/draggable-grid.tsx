/** @format */

import * as React from 'react'
import { useState, useEffect } from 'react'
import {
  PanGestureHandler,
  PanGestureHandlerStateChangeEvent,
  State as GestureState,
} from 'react-native-gesture-handler'
import { Animated, StyleSheet, StyleProp, ViewStyle } from 'react-native'
import { Block } from './block'
import { findKey, findIndex, differenceBy } from './utils'

const USE_NATIVE_DRIVER = true

export interface IOnLayoutEvent {
  nativeEvent: { layout: { x: number; y: number; width: number; height: number } }
}

interface IBaseItemType {
  key: string
  disabledDrag?: boolean
  disabledReSorted?: boolean
}

export interface IDraggableGridProps<DataType extends IBaseItemType> {
  numColumns: number
  data: DataType[]
  renderItem: (item: DataType, order: number) => React.ReactElement<any>
  style?: ViewStyle
  itemHeight?: number
  dragStartAnimation?: StyleProp<any>
  onItemPress?: (item: DataType) => void
  onDragStart?: (item: DataType) => void
  onDragRelease?: (newSortedData: DataType[]) => void
  onResetSort?: (newSortedData: DataType[]) => void
}
interface IPositionOffset {
  x: number
  y: number
}
interface IOrderMapItem {
  order: number
}
interface IItem<DataType> {
  key: string
  itemData: DataType
  currentPosition: Animated.AnimatedValueXY
  gestureEvent: any
}

function useAnimatedValue(initialValue: number) {
  return React.useMemo(() => new Animated.Value(initialValue), [])
}

export const DraggableGrid = function <DataType extends IBaseItemType>(
  props: IDraggableGridProps<DataType>,
) {
  const [blockHeight, setBlockHeight] = useState(0)
  const [blockWidth, setBlockWidth] = useState(0)
  const gridHeight = useAnimatedValue(0)
  const [hadInitBlockSize, setHadInitBlockSize] = useState(false)
  const dragStartAnimatedValue = useAnimatedValue(0)
  const [gridLayout, setGridLayout] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })
  const [activeItemIndex, setActiveItemIndex] = useState<undefined | number>()
  const [longPressActive, setLongPressActive] = useState(false)

  const panHandlerActive = React.useRef(false)
  const isDragging = React.useRef(false)
  const activeBlockOffset = React.useRef({ x: 0, y: 0 })
  const blockPositions = React.useRef<IPositionOffset[]>([])
  const orderMap = React.useRef<{
    [itemKey: string]: IOrderMapItem
  }>({})
  const itemMap = React.useRef<{
    [itemKey: string]: any
  }>({})
  const items = React.useRef<IItem<any>[]>([])

  const assessGridSize = (event: IOnLayoutEvent) => {
    if (!hadInitBlockSize) {
      let blockWidth = event.nativeEvent.layout.width / props.numColumns
      let blockHeight = props.itemHeight || blockWidth
      setBlockWidth(blockWidth)
      setBlockHeight(blockHeight)
      setGridLayout(event.nativeEvent.layout)
      setHadInitBlockSize(true)
    }
  }

  function initBlockPositions() {
    items.current.forEach((item, index) => {
      blockPositions.current[index] = getBlockPositionByOrder(index)
    })
  }

  function getBlockPositionByOrder(order: number) {
    if (blockPositions.current[order]) {
      return blockPositions.current[order]
    }
    const columnOnRow = order % props.numColumns
    const y = blockHeight * Math.floor(order / props.numColumns)
    const x = columnOnRow * blockWidth
    return {
      x,
      y,
    }
  }

  function resetGridHeight() {
    const rowCount = Math.ceil(props.data.length / props.numColumns)
    gridHeight.setValue(rowCount * blockHeight)
  }

  function onBlockPress(itemIndex: number) {
    props.onItemPress && props.onItemPress(items.current[itemIndex].itemData)
  }

  function onStartDrag(gestureState: PanGestureHandlerStateChangeEvent['nativeEvent']) {
    const activeItem = getActiveItem()
    if (!activeItem) return false
    props.onDragStart && props.onDragStart(activeItem.itemData)
    isDragging.current = true
    const { translationX, translationY } = gestureState
    const activeOrigin = blockPositions.current[orderMap.current[activeItem.key].order]
    const x = activeOrigin.x
    const y = activeOrigin.y
    activeItem.currentPosition.setOffset({
      x,
      y,
    })
    activeBlockOffset.current = {
      x: translationX,
      y: translationY,
    }
  }

  function onHandMove(event: { x: number; y: number }) {
    const activeItem = getActiveItem()
    if (!activeItem || !isDragging.current) return
    const { x: moveX, y: moveY } = event
    const xChokeAmount = Math.max(
      0,
      activeBlockOffset.current.x + moveX - (gridLayout.width - blockWidth),
    )
    const xMinChokeAmount = Math.min(0, activeBlockOffset.current.x + moveX)

    const dragPosition = {
      x: moveX + xChokeAmount + xMinChokeAmount,
      y: moveY,
    }
    const originPosition = blockPositions.current[orderMap.current[activeItem.key].order]
    const dragPositionToActivePositionDistance = getDistance(dragPosition, originPosition)

    let closetItemIndex = activeItemIndex as number
    let closetDistance = dragPositionToActivePositionDistance

    items.current.forEach((item, index) => {
      if (item.itemData.disabledReSorted) return
      if (index != activeItemIndex) {
        const dragPositionToItemPositionDistance = getDistance(
          dragPosition,
          blockPositions.current[orderMap.current[item.key].order],
        )
        if (
          dragPositionToItemPositionDistance < closetDistance &&
          dragPositionToItemPositionDistance < blockWidth
        ) {
          closetItemIndex = index
          closetDistance = dragPositionToItemPositionDistance
        }
      }
    })
    if (activeItemIndex != closetItemIndex) {
      const closetOrder = orderMap.current[items.current[closetItemIndex].key].order
      resetBlockPositionByOrder(orderMap.current[activeItem.key].order, closetOrder)
      orderMap.current[activeItem.key].order = closetOrder
      props.onResetSort && props.onResetSort(getSortData())
    }
  }

  function onHandRelease() {
    const activeItem = getActiveItem()
    if (!activeItem) return false
    props.onDragRelease && props.onDragRelease(getSortData())
    setLongPressActive(false)
    activeItem.currentPosition.flattenOffset()
    moveBlockToBlockOrderPosition(activeItem.key)
    isDragging.current = false
    Animated.timing(dragStartAnimatedValue, {
      toValue: 0,
      duration: 200,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished) {
        setActiveItemIndex(undefined)
      }
    })
  }

  function onHandlerStateChange(event: PanGestureHandlerStateChangeEvent) {
    if (event.nativeEvent.state === GestureState.ACTIVE) {
      panHandlerActive.current = true
      onStartDrag(event.nativeEvent)
    } else if (event.nativeEvent.oldState === GestureState.ACTIVE) {
      panHandlerActive.current = false
      onHandRelease()
    }
  }

  function resetBlockPositionByOrder(activeItemOrder: number, insertedPositionOrder: number) {
    let disabledReSortedItemCount = 0
    if (activeItemOrder > insertedPositionOrder) {
      for (let i = activeItemOrder - 1; i >= insertedPositionOrder; i--) {
        const key = getKeyByOrder(i)
        const item = itemMap.current[key]
        if (item && item.disabledReSorted) {
          disabledReSortedItemCount++
        } else {
          orderMap.current[key].order += disabledReSortedItemCount + 1
          disabledReSortedItemCount = 0
          moveBlockToBlockOrderPosition(key)
        }
      }
    } else {
      for (let i = activeItemOrder + 1; i <= insertedPositionOrder; i++) {
        const key = getKeyByOrder(i)
        const item = itemMap.current[key]
        if (item && item.disabledReSorted) {
          disabledReSortedItemCount++
        } else {
          orderMap.current[key].order -= disabledReSortedItemCount + 1
          disabledReSortedItemCount = 0
          moveBlockToBlockOrderPosition(key)
        }
      }
    }
  }

  function moveBlockToBlockOrderPosition(itemKey: string) {
    const itemIndex = findIndex(items.current, item => item.key === itemKey)
    items.current[itemIndex].currentPosition.flattenOffset()
    const toValue = blockPositions.current[orderMap.current[itemKey].order]
    Animated.timing(items.current[itemIndex].currentPosition, {
      toValue,
      duration: 200,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(() => {
      items.current[itemIndex].currentPosition.setOffset(toValue)
      items.current[itemIndex].currentPosition.setValue({ x: 0, y: 0 })
    })
  }

  function getKeyByOrder(order: number) {
    return findKey(orderMap.current, (item: IOrderMapItem) => item.order === order) as string
  }

  function getSortData() {
    const sortData: DataType[] = []
    items.current.forEach(item => {
      sortData[orderMap.current[item.key].order] = item.itemData
    })
    return sortData
  }

  function getDistance(startOffset: IPositionOffset, endOffset: IPositionOffset) {
    const xDistance = startOffset.x + activeBlockOffset.current.x - endOffset.x
    const yDistance = startOffset.y + activeBlockOffset.current.y - endOffset.y
    return Math.sqrt(Math.pow(xDistance, 2) + Math.pow(yDistance, 2))
  }

  function setActiveBlock(itemIndex: number, item: DataType) {
    if (item.disabledDrag) return
    setLongPressActive(true)
    setActiveItemIndex(itemIndex)
  }

  function startDragStartAnimation() {
    if (!props.dragStartAnimation) {
      dragStartAnimatedValue.setValue(0)
      Animated.timing(dragStartAnimatedValue, {
        toValue: 1,
        duration: 100,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start()
    }
  }

  function getBlockStyle(itemIndex: number) {
    return [
      {
        justifyContent: 'center',
        alignItems: 'center',
      },
      hadInitBlockSize && {
        width: blockWidth,
        height: blockHeight,
        position: 'absolute',
        top: 0,
        left: 0,
        transform: items.current[itemIndex].currentPosition.getTranslateTransform(),
      },
    ]
  }

  function getDragStartAnimation(itemIndex: number) {
    if (activeItemIndex != itemIndex) {
      return
    }

    return props.dragStartAnimation || getDefaultDragStartAnimation()
  }

  function getActiveItem() {
    if (activeItemIndex === undefined) return false
    return items.current[activeItemIndex]
  }

  function getDefaultDragStartAnimation() {
    return {
      transform: [
        {
          scale: dragStartAnimatedValue.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.1],
          }),
        },
      ],
      shadowColor: '#000000',
      shadowOpacity: dragStartAnimatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.2],
      }),
      shadowRadius: dragStartAnimatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 6],
      }),
      shadowOffset: {
        width: 1,
        height: 1,
      },
    }
  }

  function addItem(item: DataType, index: number) {
    blockPositions.current.push(getBlockPositionByOrder(items.current.length))
    orderMap.current[item.key] = {
      order: index,
    }
    itemMap.current[item.key] = item
    const currentPosition = new Animated.ValueXY({ x: 0, y: 0 })
    currentPosition.setOffset(getBlockPositionByOrder(index))
    items.current.push({
      key: item.key,
      itemData: item,
      currentPosition,
      gestureEvent: Animated.event(
        [
          {
            nativeEvent: {
              translationX: currentPosition.x,
              translationY: currentPosition.y,
            },
          },
        ],
        { useNativeDriver: USE_NATIVE_DRIVER },
      ),
    })
  }

  function removeItem(item: IItem<DataType>) {
    const itemIndex = findIndex(items.current, curItem => curItem.key === item.key)
    items.current.splice(itemIndex, 1)
    blockPositions.current.pop()
    delete orderMap.current[item.key]
  }

  function diffData() {
    props.data.forEach((item, index) => {
      if (orderMap.current[item.key]) {
        if (orderMap.current[item.key].order != index) {
          orderMap.current[item.key].order = index
          moveBlockToBlockOrderPosition(item.key)
        }
        const currentItem = items.current.find(i => i.key === item.key)
        if (currentItem) {
          currentItem.itemData = item
        }
        itemMap.current[item.key] = item
      } else {
        addItem(item, index)
      }
    })
    const deleteItems = differenceBy(items.current, props.data, 'key')
    deleteItems.forEach(item => {
      removeItem(item)
    })
  }

  useEffect(() => {
    startDragStartAnimation()
  }, [activeItemIndex])
  useEffect(() => {
    if (hadInitBlockSize) {
      initBlockPositions()
    }
  }, [gridLayout])
  useEffect(() => {
    resetGridHeight()
  })
  useEffect(() => {
    if (activeItemIndex === undefined) {
      return
    }
    const item = items.current[activeItemIndex]
    const listenerId = item.currentPosition.addListener(onHandMove)
    return () => {
      item.currentPosition.removeListener(listenerId)
    }
  }, [activeItemIndex])
  if (hadInitBlockSize) {
    diffData()
  }

  const itemList = items.current.map((item, itemIndex) => {
    return (
      <PanGestureHandler
        key={item.key}
        onGestureEvent={item.gestureEvent}
        onHandlerStateChange={onHandlerStateChange}
        // To make sure the pan responder doesn't activate before
        // a long press we set a huge minimum active offset.
        // Using enabled doesn't work since the responder is
        // completely skipped.
        activeOffsetX={longPressActive ? 0 : 10000}
        activeOffsetY={longPressActive ? 0 : 10000}>
        <Animated.View
          style={[getBlockStyle(itemIndex), itemIndex === activeItemIndex && { zIndex: 3 }]}>
          <Block
            onPress={onBlockPress.bind(null, itemIndex)}
            onLongPress={() => setActiveBlock(itemIndex, item.itemData)}
            onPressOut={() => {
              setTimeout(() => {
                if (!panHandlerActive.current) {
                  onHandRelease()
                }
              }, 100)
            }}
            dragStartAnimationStyle={getDragStartAnimation(itemIndex)}>
            {props.renderItem(item.itemData, orderMap.current[item.key].order)}
          </Block>
        </Animated.View>
      </PanGestureHandler>
    )
  })

  return (
    <Animated.View
      style={[
        styles.draggableGrid,
        props.style,
        {
          height: gridHeight,
        },
      ]}
      onLayout={assessGridSize}>
      {hadInitBlockSize && itemList}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  draggableGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
})
