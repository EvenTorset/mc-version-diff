export interface PopupableInput {
  title?: string
  description?: string
  content?: string
  group?: string
  thumbnails?: boolean
  zoom?: boolean
}

export function popupable(input: PopupableInput) {
  return {
    'data-popupable': true,
    'data-popupable-title': input.title,
    'data-popupable-description': input.description,
    'data-popupable-content': input.content,
    'data-popupable-group': input.group,
    'data-popupable-thumbnails': input.thumbnails,
    'data-popupable-zoomable': input.zoom,
    'data-popupable-order': 'content, image, counter, thumbnails',
    'data-popupable-looping': true,
    'data-popupable-fixed-content-height': true,
  }
}
