// https://gist.github.com/neftaly/7c4d96f1ba37aada7f366b5393e59ddb

import React, { Suspense, useMemo } from 'react'
import { Box } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader'

const DefaultModel = ({sceneRef}) => (
  <Box ref={sceneRef} args={[1, 1, 1]}>
    <meshBasicMaterial attach="material" color="hotpink" />
  </Box>
)

const SvgShape = ({ shape, color, index }) => (
  <mesh>
    <meshLambertMaterial
      attach="material"
      color={color}
      /*
        HACK: Offset SVG polygons by index
        The paths from SVGLoader Z-fight.
        This fix causes stacking problems with detailed SVGs.
      */
      polygonOffset
      polygonOffsetFactor={index * -0.1}
    />
    <shapeBufferGeometry attach="geometry" args={[shape]} />
  </mesh>
)

const SvgAsync = React.memo(({ url, sceneRef }) => {
  const { paths } = useLoader(SVGLoader, url)
  const shapes = useMemo(
    () =>
      paths.flatMap((path, index) =>
        path.toShapes(true).map(shape => ({ index, shape, color: path.color }))
      ),
    [paths]
  )
  return (
    <group
      ref={sceneRef}
      children={shapes.map((props, key) => (
        <SvgShape key={key} {...props} />
      ))}
      rotation={[-Math.PI / 2, 0, Math.PI]}
      scale={[-0.01, 0.01, 0.01]}
    />
  )
})

const Svg = props => (
  <Suspense
    fallback={<DefaultModel {...props} />}
    children={<SvgAsync {...props} />}
  />
)

export default Svg