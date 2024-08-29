#include <nlohmann/json.hpp>
#include "tree_parse.hpp"
#include <iostream>
#include <fstream>

using json = nlohmann::json;

TreeNode* parse_json_to_tree(const json &j_node) {
  TreeNode* node = new TreeNode();
  node->name = j_node.value("name", "");
  node->value = 0;

  if (j_node.contains("value")) {
    node->value = j_node["value"].get<uint64_t>();
  }

  node->cold = j_node.value("cold", false);

  if (j_node.contains("samples")) {
    for (const auto &sample : j_node["samples"]) {
      Sample s;
      s.timestamp = sample["timestamp"].get<uint64_t>();
      s.value = sample["period"].get<uint64_t>();
      node->samples.push_back(s);
    }
  }

  if (j_node.contains("children")) {
    for (const auto &child : j_node["children"]) {
      node->children.push_back(parse_json_to_tree(child));
    }
  }

  return node;
}

json tree_to_json(const TreeNode &node) {
  json j_node;
  j_node["name"] = node.name;
  j_node["value"] = node.value;
  j_node["cold"] = node.cold;
  j_node["samples"] = json::array();

  for (const auto &sample : node.samples) {
    j_node["samples"].push_back({{"timestamp", sample.timestamp},
                                 {"period", sample.value}});
  }

  for (const auto &child : node.children) {
    j_node["children"].push_back(tree_to_json(*child));
  }

  return j_node;
}

void save_json_to_file(const json &j, const std::string &filename) {
  std::ofstream file(filename);
  if (file.is_open()) {
    file << j.dump();
    file.close();
  } else {
    std::cerr << "Unable to open file: " << filename << std::endl;
  }
}

void print_tree(const TreeNode &node, int level = 0) {
  std::string indent(level * 2, ' ');
  std::cout << indent << "Name: " << node.name << ", Value: " <<
    node.value << ", Samples  ";

  for (const auto &sample : node.samples) {
    std::cout << "ts: " << sample.timestamp << " val: " << sample.value << "; ";
  }

  std::cout << std::endl;

  for (const auto &child : node.children) {
    print_tree(*child, level + 1);
  }
}

int main() {
  std::ifstream file("data2.json"); // this is only for test
  json j;
  file >> j;

  uint64_t start_time = 0;

  if (j.contains("first_time")) {

    start_time = j["first_time"].get<uint64_t>();
  }

  std::string counter_tree_key = "walltime";

  if (j.contains(counter_tree_key) && j[counter_tree_key].size() > 1) {
    // time ordered json
    TreeNode* second_node = parse_json_to_tree(j[counter_tree_key][1]);
    TreeNode* first_node = parse_json_to_tree(j[counter_tree_key][0]);

    // std::cout << "first time " << start_time << std::endl;
    uint64_t threshold_left =  0; // - start_time if needed
    uint64_t threshold_right = 2292600756000000000 + start_time; // - start_time if needed


    TreeNode* pruned_tree = slice_flame_graph(second_node, threshold_left,
                                      threshold_right, counter_tree_key, false);

    json pruned_tree_json = tree_to_json(*pruned_tree);
    save_json_to_file(pruned_tree_json, "pruned_tree.json");



    // tree that only includes nodes which overlap with the time period
    // between with two thresholds
    std::cout << "\nFull Tree :\n";
    print_tree(*second_node);

    std::cout << "\nFull Tree Non-time ordered :\n";
    print_tree(*first_node);

    // tree that only includes nodes which overlap with the time period
    // between with two thresholds
    std::cout << "\nPruned Tree :\n";
    print_tree(*pruned_tree);


    deleteTree(pruned_tree);
    deleteTree(first_node);
    deleteTree(second_node);

    // Test merging:
     
    TreeNode* root1 = new TreeNode{
      "root", 0, false, {}, {
          new TreeNode{"A", 10, false, {{100, 1}, {200, 2}}, 
              {new TreeNode{"X", 5, true, {{300, 3}}, {}}, 
              new TreeNode{"Y", 10, false, {{400, 4}}, {}}}},
          new TreeNode{"B", 20, true, {{600, 6}}, {}},
          new TreeNode{"A", 5, false, {{900, 9}}, 
              {new TreeNode{"X", 4, false, {{1000, 10}}, {}}, 
              new TreeNode{"Y", 2, true, {{1100, 11}}, {}}}},
      }
    };

    TreeNode* root2 = new TreeNode{
        "root", 0, false, {}, {
            new TreeNode{"A", 10, false, {{100, 1}, {200, 2}}, 
                {new TreeNode{"X", 5, true, {{300, 3}}, 
                    {new TreeNode{"Z", 10, false, {{401, 4}}, {}}}}, 
                new TreeNode{"Y", 10, false, {{400, 4}}, 
                    {new TreeNode{"Z", 10, false, {{400, 4}}, {}}}}}},
            new TreeNode{"B", 20, true, {{600, 6}}, 
                {new TreeNode{"Z", 10, false, {{402, 4}}, {}}}},
            new TreeNode{"A", 5, false, {{900, 9}}, 
                {new TreeNode{"X", 4, false, {{1000, 10}}, 
                    {new TreeNode{"Z", 10, false, {{404, 4}}, {}}}}, 
                new TreeNode{"Y", 2, true, {{1100, 11}}, 
                    {new TreeNode{"Z", 10, false, {{405, 4}}, {}}}}}},
        }
    };


    TreeNode* pruned_tree1 = slice_flame_graph(root1, threshold_left, threshold_right, counter_tree_key, false);
    TreeNode* pruned_tree2 = slice_flame_graph(root2, threshold_left, threshold_right, counter_tree_key, false);

    
    std::cout  << "Not merged 1 "<< std::endl;
    print_tree(*root1);

    std::cout  << "Merged 1 "<< std::endl;
    print_tree(*pruned_tree1);

    std::cout << std::endl;

    std::cout  << "Not merged 2 "<< std::endl;
    print_tree(*root2);

    std::cout  << "Merged 2 "<< std::endl;
    print_tree(*pruned_tree2);

    deleteTree(pruned_tree1);
    deleteTree(pruned_tree2);
    deleteTree(root1);
    deleteTree(root2);

  } else {
    std::cerr << "The walltime array does not have at least two elements." << std::endl;
  }

  return 0;
}
