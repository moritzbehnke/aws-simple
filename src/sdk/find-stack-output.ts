import {CloudFormation} from 'aws-sdk';
import {
  ExportName,
  createUniqueExportName,
} from '../utils/create-unique-export-name';

export function findStackOutput(
  stack: CloudFormation.Stack,
  exportName: ExportName
): string {
  const {StackName, Outputs} = stack;

  const output =
    Outputs &&
    Outputs.find(
      (Output) =>
        Output.ExportName === createUniqueExportName(StackName, exportName) ||
        Output.ExportName ===
          createUniqueExportName(StackName, exportName, true)
    );

  const outputValue = output && output.OutputValue;

  if (!outputValue) {
    throw new Error(
      `No output for export name (${exportName}) found in stack (${StackName}).`
    );
  }

  return outputValue;
}
