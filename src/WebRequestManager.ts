import { Config } from "./types"
import { getDefaultConfig } from "./defaults"

export class WebRequestManager {
  config: Config
  attached = false 
  constructor() {
    chrome.storage.local.get(items => {
      this.handleConfigChange(items["config"] || getDefaultConfig())
    })
    chrome.storage.onChanged.addListener(changes => {
      const config = changes["config"].newValue
      if (!config) return 
      this.handleConfigChange(config)
    })
  }
  release = () => {
    chrome.webRequest.onHeadersReceived.removeListener(this.handleHeadersReceived)
  }
  handleHeadersReceived = (details: chrome.webRequest.WebResponseHeadersDetails) => {
    let newHeaders: chrome.webRequest.HttpHeader[] = []
    let featurePolicies: {feature: string, allowList: string[]}[] = []

    details.responseHeaders.forEach(header => {
      if (header.name.trim().toLowerCase() !== "feature-policy") {
        newHeaders.push(header)
      } else {
        featurePolicies = [...featurePolicies, ...fpParser(header.value.trim())]
      }
    })
    
    if (!featurePolicies.some(f => f.feature === "picture-in-picture")) return 
    const newFeaturePolicies = featurePolicies.filter(v => v.feature !== "picture-in-picture")
    
    if (newFeaturePolicies.length > 0) {
      newHeaders.push({
        name: "feature-policy",
        value: newFeaturePolicies.map(f => [f.feature, ...f.allowList].join(" ")).join(";")
      })
    }

    return {
      responseHeaders: newHeaders
    } as chrome.webRequest.BlockingResponse
  }
  attach = () => {
    if (this.attached) return 
    this.attached = true 
    chrome.webRequest.onHeadersReceived.addListener(this.handleHeadersReceived, {
      urls: ["https://*/*", "http://*/*"],
      types: ['main_frame']
    }, ['blocking', 'responseHeaders'])
  }
  detach = () => {
    if (!this.attached) return 
    chrome.webRequest.onHeadersReceived.removeListener(this.handleHeadersReceived)
    this.attached = false 
  }
  handleConfigChange = (config: Config) => {
    this.config = config 
    if (this.config.enabled) {
      this.attach()
    } else {
      this.detach()
    }
  }
}

function fpParser(value: string) {
  value = value.trim() 
  if (value.length === 0) return []
  return value.split(";").map(v => {
    let [feature, ...allowList] = v.trim().split(/\s+/)
    return {feature, allowList}
  })
}