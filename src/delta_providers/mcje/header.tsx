import Row from '@/components/Row.vue'
import { getSurroundingDeltas, getVersion, getVersionDetails } from './version_manifest'
import Dim from '@/components/Dim.vue'
import Tooltip from '@/components/Tooltip.vue'
import { NButton, NIcon, NTime } from 'naive-ui'
import { formatBytes } from '@/util/bytes'
import Col from '@/components/Col.vue'
import Spacer from '@/components/Spacer.vue'
import { ArrowLeft16Filled, ArrowRight16Filled, ArrowRight24Regular } from '@vicons/fluent'
import { RouterLink } from 'vue-router'
import { getPackFormats } from './pack_formats'

export async function singleHeader(id: string, deselect?: (id: string) => void) {
  const version = await getVersion(id)
  if (version === null) {
    return 'n/a'
  }
  const details = await getVersionDetails(id)
  const packs = getPackFormats(id)
  return <div>
    <h2>{version.id}</h2>
    <div>
      <Row>
        <Dim>Released:</Dim>
        <div>
          <Tooltip v-slots={{
            trigger: ({ props }: any) =>
              <NTime {...props} time={new Date(version.releaseTime)} to={Date.now()} type='relative' />
          }}>
            <NTime time={new Date(version.releaseTime)} />
          </Tooltip>
        </div>
      </Row>

      <Row>
        <Dim>Size:</Dim>
        <div>{formatBytes(details.downloads.client.size)}</div>
      </Row>

      <Row>
        <Dim>Asset index:</Dim>
        <div>{details.assetIndex.id}</div>
      </Row>

      {packs?.resource ? <Row>
        <Dim>Resource format:</Dim>
        <div>{packs.resource}</div>
      </Row> : ''}

      {packs?.data ? <Row>
        <Dim>Data format:</Dim>
        <div>{packs.data}</div>
      </Row> : ''}

      <Row>
        <Dim>Type:</Dim>
        <div>{version.type}</div>
      </Row>

      <Row>
        <Dim>Download:</Dim>
        <div>
          <a
            href={details.downloads.client.url}
            rel='noreferrer'
            download
          >client</a>{details.downloads.server ? <><Dim>, </Dim><a
            href={details.downloads.server.url}
            rel='noreferrer'
            download
          >server</a></> : ''}
        </div>
      </Row>

      {deselect ? <Row justify='center' style='margin-top: 8px;'>
        <NButton onClick={() => deselect(id)} >Deselect</NButton>
      </Row> : ''}
    </div>
  </div>
}

export async function header(a: string, b: string, nav: boolean = false, deselect?: (id: string) => void) {
  const ha = await singleHeader(a, deselect)
  const hb = await singleHeader(b, deselect)
  const { prev, next } = nav ? await getSurroundingDeltas(a, b) : { prev: null, next: null }
  return <Col gap='20px' style='flex: 1;'>
    <Row style='align-self: stretch;'>
      <Spacer />
      {ha}
      <Spacer flex='1' max='100px' />
      <NIcon size={24} component={ArrowRight24Regular} />
      <Spacer flex='1' max='100px' />
      {hb}
      <Spacer />
    </Row>
    {prev !== null || next !== null ?
      <Row>
        {prev !== null ? (
          <Tooltip
            v-slots={{
              trigger: ({ props }: any) => (
                <RouterLink {...props} to={{ name: 'delta', params: { provider: 'mcje', a: prev.a, b: prev.b }}}>
                  <NButton icon-placement='left' renderIcon={() => <NIcon component={ArrowLeft16Filled}/>}>
                    Previous
                  </NButton>
                </RouterLink>
              )
            }}
          >
            <Row>
              {prev.a}
              <NIcon component={ArrowRight16Filled}/>
              {prev.b}
            </Row>
          </Tooltip>
        ) : ''}
        {next !== null ? (
          <Tooltip
            v-slots={{
              trigger: ({ props }: any) => (
                <RouterLink {...props} to={{ name: 'delta', params: { provider: 'mcje', a: next.a, b: next.b }}}>
                  <NButton icon-placement='right' renderIcon={() => <NIcon component={ArrowRight16Filled}/>}>
                    Next
                  </NButton>
                </RouterLink>
              )
            }}
          >
            <Row>
              {next.a}
              <NIcon component={ArrowRight16Filled}/>
              {next.b}
            </Row>
          </Tooltip>
        ) : ''}
      </Row>
    : ''}
  </Col>
}
