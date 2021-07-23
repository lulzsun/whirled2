import React from 'react'
import AvatarEditor from 'react-avatar-editor'

class PictureEditor extends React.Component {
  getImageScaledToCanvas = () => {
    if (this.editor) {
      return this.editor.getImageScaledToCanvas()
    }
  }

  getImage = () => {
    if (this.editor) {
      return this.editor.getImage()
    }
  }

  setEditorRef = (editor) => (this.editor = editor)

  render() {
    return (
      <AvatarEditor
        ref={this.setEditorRef}
        image={this.props.image}
        width={this.props.width}
        height={this.props.height}
        border={this.props.border}
        borderRadius={this.props.borderRadius}
        color={this.props.color} // RGBA
        scale={this.props.scale}
      />
    )
  }
}

export default PictureEditor