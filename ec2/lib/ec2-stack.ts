import * as cdk from 'aws-cdk-lib';
import { Instance, InstanceClass, InstanceSize, InstanceType, MachineImage, UserData } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as path from 'path';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class Ec2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Creating the VPC instance - 
    // we will have control over the network 
    // and access its resources like security, compression and stuff

    const vpc = cdk.aws_ec2.Vpc.fromLookup(this, "DefaultVPC", {
      isDefault: true,
    });

    // Define the security group
    const securityGroup = new cdk.aws_ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: 'Allow SSH and SSM access',
      allowAllOutbound: true
    });
    securityGroup.addIngressRule(
      cdk.aws_ec2.Peer.anyIpv4(),
      cdk.aws_ec2.Port.tcp(22),
      'Allow SSH access from anywhere'
    );
    securityGroup.addIngressRule(
      cdk.aws_ec2.Peer.ipv4(vpc.vpcCidrBlock),
      cdk.aws_ec2.Port.tcp(443),
      'Allow SSM access within the VPC'
    );

    // Define the IAM role with SSM permissions
    const role = new cdk.aws_iam.Role(this, 'InstanceRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('ec2.amazonaws.com')
    });
    role.addManagedPolicy(cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    //Adding our python scripts to S3

    const s3Scripts = new cdk.aws_s3_assets.Asset(this, "Python-Script", {
      path: path.join(__dirname, 'python-scripts/simple.py'),
    })

    // Starter data to add while intializing the VM.

    const initData = cdk.aws_ec2.CloudFormationInit.fromElements(
      cdk.aws_ec2.InitFile.fromExistingAsset('/home/ec2-user/simple.py', s3Scripts, {})
    );

    // Creating the actual ec2 instance

    const instance = new Instance(
      this, "PythonEnvEC2Instance", {
        vpc: vpc,
        machineImage: MachineImage.latestAmazonLinux2023(),
        instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
        role: role,
        securityGroup: securityGroup,
        init: initData
      }
    )

    instance.userData.addCommands(
      `#!/bin/bash
       sudo dnf -y update;
       sudo dnf -y install cronie;
       sudo systemctl enable crond;
       sudo systemctl start crond;
       crontab -l > tmpfile;
       echo "* * * * * python3 /home/ec2-user/simple.py >> /home/ec2-user/output.log 2>&1" >> tmpfile;
       crontab tmpfile;
       rm tmpfile
      `
    );
    

    }
}
