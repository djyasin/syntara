/**
 * E2E helpers for form_trigger configuration in the workflow builder (SynFormFieldBuilder).
 */
import { expect, toAppUrl, type Page } from '../fixtures'
import { isSkipWebServerForPlaywrightTests } from '../playwrightWebServerEnv'
import { apiRequest, ensureProject } from '../utils/api'

import { layoutCanvas } from './canvas-interaction'
import {
  type FormPromptDefinitionField,
  parseFormDefinitionFieldFromApi,
  scrollFormFieldBuilderIntoView,
} from './formFieldBuilder'
import { addFormTrigger, addScriptNode } from './v2-nodes'
import { clickSaveAndWait } from './workflow-save'
import {
  closeNodeEditorPanel,
  openNodeForEditing,
  saveAndCloseNodeForm,
  saveWorkflow,
  selectProjectIfRequired,
  waitForUIReady,
} from './workflows'

const isRealBackendE2e = isSkipWebServerForPlaywrightTests()
const FORM_TRIGGER_BUILDER_SAVE_TIMEOUT = isRealBackendE2e ? 60_000 : 30_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function workflowDefinitionTriggers(workflow: unknown): unknown[] | null {
  if (!isRecord(workflow)) {
    return null
  }
  const version = workflow.version
  if (isRecord(version) && isRecord(version.workflow_definition)) {
    const triggers = version.workflow_definition.triggers
    if (isUnknownArray(triggers)) {
      return triggers
    }
  }
  const definition = workflow.definition
  if (isRecord(definition) && isUnknownArray(definition.triggers)) {
    return definition.triggers
  }
  return null
}

function readFormTriggerParameters(workflow: unknown): Record<string, unknown> {
  const triggers = workflowDefinitionTriggers(workflow)
  if (!triggers) {
    throw new Error('form_trigger workflow triggers not found on workflow')
  }
  const formTrigger = triggers.find((trigger) => isRecord(trigger) && trigger.type === 'form_trigger')
  if (!isRecord(formTrigger) || !isRecord(formTrigger.parameters)) {
    throw new Error('form_trigger trigger not found on workflow')
  }
  return formTrigger.parameters
}

/** Open the form_trigger node editor on the canvas. */
export async function openFormTriggerForEditing(page: Page, triggerName: string) {
  const openTimeout = isRealBackendE2e ? 45_000 : 30_000
  await expect(async () => {
    await layoutCanvas(page)
    await waitForUIReady(page)
    await openNodeForEditing(page, triggerName)
    await expect(page.locator('#form-trigger-form-fields')).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: openTimeout, intervals: [500, 1_000, 2_000] })
}

export async function createFormTriggerWorkflowWithBuilderOpen(
  page: Page,
  workflowName: string,
  triggerName = 'Start form'
): Promise<void> {
  await ensureProject(page)
  await page.goto(toAppUrl('/workflow-builder/new'))
  await selectProjectIfRequired(page)
  await addFormTrigger(page, triggerName)
  await addScriptNode(page, 'Next step', 'print("ok")')
  await expect(page.getByRole('button', { name: 'Save workflow' })).toBeEnabled({ timeout: 15_000 })
  await saveWorkflow(page, workflowName, { timeout: FORM_TRIGGER_BUILDER_SAVE_TIMEOUT })
  const triggerNode = page.locator('[role="group"][aria-roledescription="node"]').filter({ hasText: triggerName })
  await expect(triggerNode).toBeVisible({ timeout: isRealBackendE2e ? 30_000 : 15_000 })
  await waitForUIReady(page)
  await openFormTriggerForEditing(page, triggerName)
  await scrollFormFieldBuilderIntoView(page, 'form_trigger')
}

export async function saveFormTriggerAndWorkflow(page: Page): Promise<void> {
  await saveAndCloseNodeForm(page, true)
  await closeNodeEditorPanel(page)
  await expect(page.getByRole('button', { name: 'Save workflow' })).toBeEnabled({ timeout: 15_000 })
  await clickSaveAndWait(page, { timeout: FORM_TRIGGER_BUILDER_SAVE_TIMEOUT })
}

/** Builder validation banner after save or verify (PatternFly prefixes accessible names with alert variant). */
export function formTriggerValidationBannerLocator(page: Page) {
  return page
    .getByRole('heading', {
      name: /Saved with \d+ (warning|issue)|Verification failed — \d+ issue/i,
    })
    .or(page.getByText(/Saved with \d+ (warning|issue)|Verification failed — \d+ issue/i))
}

/** Expand the inline validation alert that contains the banner title (Verify or advisory save). */
export async function expandFormTriggerValidationBannerDetails(page: Page) {
  await expect(formTriggerValidationBannerLocator(page).first()).toBeVisible()
  await expect(async () => {
    const details = page.getByRole('button', { name: /Danger alert details|Warning alert details|alert details/i })
    await expect(details.first()).toBeVisible({ timeout: 3_000 })
    await details.first().click()
  }).toPass({ timeout: 15_000, intervals: [500, 1_000] })
}

export async function readFormTriggerDefinitionFromApi(
  page: Page,
  workflowId: string
): Promise<{ fields: FormPromptDefinitionField[] }> {
  const response = await apiRequest(page, 'get', `/workflows/${workflowId}`)
  const workflow: unknown = await response.json()
  const parameters = readFormTriggerParameters(workflow)
  const formDefinition = parameters.form_definition
  if (!isRecord(formDefinition) || !Array.isArray(formDefinition.fields)) {
    throw new Error('form_trigger form_definition not found on workflow')
  }
  const fields: FormPromptDefinitionField[] = []
  for (const rawField of formDefinition.fields) {
    const field = parseFormDefinitionFieldFromApi(rawField)
    if (!field) {
      throw new Error('form_trigger form_definition fields failed validation')
    }
    fields.push(field)
  }
  return { fields }
}

export async function reloadBuilderAndReopenFormTrigger(page: Page, triggerName: string) {
  const reloadTimeout = isRealBackendE2e ? 90_000 : 60_000
  await expect(async () => {
    await page.reload()
    await waitForUIReady(page)
    await openFormTriggerForEditing(page, triggerName)
  }).toPass({ timeout: reloadTimeout, intervals: [1_000, 2_000, 3_000] })
}

export { clickSaveAndWait }
