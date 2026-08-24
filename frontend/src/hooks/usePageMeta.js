import { useEffect } from 'react'

/**
 * Per-route document title + meta description. Each page calls this once with
 * its own strings; the next page simply overwrites them.
 */
export default function usePageMeta({ title, description }) {
  useEffect(() => {
    if (title) document.title = title

    if (description) {
      let tag = document.querySelector('meta[name="description"]')
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute('name', 'description')
        document.head.appendChild(tag)
      }
      tag.setAttribute('content', description)
    }
  }, [title, description])
}
